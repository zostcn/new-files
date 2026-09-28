<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { Backup } from '@/api/backup';
import { kindOf } from '@/utils/file';

const props = defineProps<{ item: Backup; url: string; loading: boolean }>();

const emit = defineEmits<{ close: []; download: [] }>();

const root = ref<HTMLElement>();
const body = ref<HTMLElement>();
const kind = computed(() => kindOf(props.item));

// 1 = 适应窗口，放大后靠拖动看局部
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

const scale = ref(MIN_SCALE);
const offsetX = ref(0);
const offsetY = ref(0);

const dragging = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 以光标为中心缩放：缩放前后让光标底下那个点停在原地。
 * 图片被父级 flex 居中，所以图片自身的中心就是 body 的中心，
 * 变换是 translate(tx,ty) scale(s)，即屏幕坐标 = 中心 + t + s * 图片局部坐标，
 * 代入「光标处不动」解出 t_new = c - (c - t_old) * (s_new / s_old)。
 */
function onWheel(e: WheelEvent) {
  if (kind.value !== 'image') return;
  e.preventDefault();

  const next = clamp(scale.value + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP), MIN_SCALE, MAX_SCALE);
  if (next === scale.value) return;

  const rect = body.value?.getBoundingClientRect();
  if (rect) {
    // 光标相对 body 中心的坐标
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const ratio = next / scale.value;
    offsetX.value = cx - (cx - offsetX.value) * ratio;
    offsetY.value = cy - (cy - offsetY.value) * ratio;
  }

  scale.value = next;
  // 缩回适应窗口时归位，避免留着一个看不见的偏移
  if (next === MIN_SCALE) {
    offsetX.value = 0;
    offsetY.value = 0;
  }
}

function onPointerDown(e: PointerEvent) {
  // 没放大就没有可拖的余地
  if (kind.value !== 'image' || scale.value <= MIN_SCALE) return;

  dragging.value = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartOffsetX = offsetX.value;
  dragStartOffsetY = offsetY.value;
  // 捕获指针，拖出图片范围也不会断
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  // 位移不参与缩放（transform 里 translate 在外层），所以和光标 1:1 跟手
  offsetX.value = dragStartOffsetX + (e.clientX - dragStartX);
  offsetY.value = dragStartOffsetY + (e.clientY - dragStartY);
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return;

  dragging.value = false;
  const el = e.currentTarget as HTMLElement;
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
}

// 根节点拿到焦点才能收到 Esc
onMounted(() => root.value?.focus());
</script>

<template>
  <div ref="root" class="pv" tabindex="-1" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="pv__card" :class="{ 'pv__card--compact': kind === 'audio' }">
      <button class="pv__close" type="button" aria-label="关闭" @click="emit('close')">
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <h3 class="pv__title" :title="item.name">{{ item.name }}</h3>

      <div
        ref="body"
        class="pv__body"
        @wheel="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <p v-if="loading" class="pv__hint">加载中…</p>
        <img
          v-else-if="kind === 'image'"
          class="pv__image"
          :class="{ 'pv__image--zoomable': scale > MIN_SCALE, 'pv__image--dragging': dragging }"
          :style="{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }"
          :src="url"
          :alt="item.name"
          :draggable="false"
          @dragstart.prevent
        />
        <video v-else-if="kind === 'video'" class="pv__media" :src="url" controls />
        <audio v-else-if="kind === 'audio'" class="pv__media" :src="url" controls />
        <iframe v-else-if="kind === 'pdf'" class="pv__frame" :src="url" :title="item.name" />
        <p v-else class="pv__hint">该类型不支持预览</p>
      </div>

      <div class="pv__footer">
        <button class="fm__btn" type="button" @click="emit('download')">下载</button>
        <button class="fm__btn" type="button" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pv {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.35);
  outline: none;
}

.pv__card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(880px, calc(100vw - 48px));
  /* 高度必须固定：图片解码前没有固有尺寸，用 max-height 的话加载完成时整个弹窗会跳一下。
     用 dvh 而不是 vh：手机地址栏收起/展开时 vh 不变，弹窗会被裁掉或顶出去 */
  height: min(600px, calc(100dvh - 80px));
  padding: 18px 20px 16px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

/* 音频本体只有几十像素高，撑成大弹窗只会留一片空白 —— 它是唯一不需要预留空间的类型 */
.pv__card--compact {
  height: auto;
}

.pv__close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: #8b929c;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.pv__close:hover {
  color: #1f2329;
  background: #f2f3f5;
}

.pv__title {
  margin: 0 0 12px;
  padding-right: 26px;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pv__body {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  /* 放大后的图片由这里裁切，不能溢出到卡片外 */
  overflow: hidden;
  /* 拖动时不要顺带选中文字/元素，否则会有蓝色高亮拖影。前缀不能省，老版 iOS 只认 -webkit- */
  -webkit-user-select: none;
  user-select: none;
}

/* 弹窗高度固定后，媒体按 body 的可用高度撑满即可，不用再各自算 vh */
.pv__image,
.pv__media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.pv__image {
  transition: transform 0.12s ease-out;
}

.pv__image--zoomable {
  cursor: grab;
}

.pv__image--dragging {
  /* 拖动必须跟手，有过渡就会"拖不动" */
  transition: none;
  cursor: grabbing;
}

.pv__frame {
  width: 100%;
  height: 100%;
  border: none;
}

.pv__hint {
  margin: 0;
  padding: 60px 0;
  font-size: 13px;
  color: #a1a7b0;
}

.pv__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .pv__card {
    width: calc(100vw - 24px);
    height: min(600px, calc(100dvh - 24px));
  }
}
</style>
