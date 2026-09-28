<script lang="ts">
/**
 * 弹窗会叠：编辑器上还能再弹一个「放弃修改？」的确认框。
 * 两层都响应 Esc 的话，一次按键会把编辑器一起静默关掉，未保存的内容就丢了。
 * 按挂载顺序入栈，最后挂载的那层在最上面，只有它响应。
 */
const stack: symbol[] = [];
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, useSlots } from 'vue';

withDefaults(
  defineProps<{
    title: string;
    confirmText?: string;
    loading?: boolean;
    danger?: boolean;
    width?: number;
    /** 撑满视口（高度也给足），内容自己决定怎么用这块空间 */
    fullscreen?: boolean;
  }>(),
  { confirmText: '确定', loading: false, danger: false, width: 400, fullscreen: false },
);

const slots = useSlots();

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const id = Symbol('dlg');

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (stack[stack.length - 1] !== id) return;

  emit('cancel');
}

onMounted(() => {
  stack.push(id);
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  const i = stack.indexOf(id);
  if (i !== -1) stack.splice(i, 1);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="dlg" @click.self="emit('cancel')">
    <div
      class="dlg__card"
      :class="{ 'dlg__card--full': fullscreen }"
      :style="fullscreen ? undefined : { width: `${width}px` }"
    >
      <!-- 标题和右上角按钮同属一行：普通形态下按钮靠绝对定位贴在卡片角上（见样式），
           全屏时改回参与排列，好跟着正文那一列一起居中 -->
      <div class="dlg__head">
        <h3 class="dlg__title" :class="{ 'dlg__title--extra': !!slots['header-extra'] }">
          {{ title }}
        </h3>

        <!-- 头部右侧的额外按钮（如编辑器的全屏开关），排在 × 左边 -->
        <div v-if="slots['header-extra']" class="dlg__head-extra">
          <slot name="header-extra" />
        </div>

        <button class="dlg__close" type="button" aria-label="关闭" @click="emit('cancel')">
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
      </div>

      <div class="dlg__body">
        <slot />
      </div>

      <div class="dlg__footer">
        <!-- 左侧留给调用方放额外操作（如编辑器的复制/下载）；不给就什么都不显示 -->
        <div class="dlg__footer-left">
          <slot name="footer-left" />
        </div>
        <button class="dlg__btn" type="button" @click="emit('cancel')">取消</button>
        <button
          class="dlg__btn dlg__btn--primary"
          :class="{ 'dlg__btn--danger': danger }"
          type="button"
          :disabled="loading"
          @click="emit('confirm')"
        >
          {{ loading ? '处理中...' : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dlg {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.35);
}

.dlg__card {
  position: relative;
  max-width: calc(100vw - 32px);
  /* 手机键盘弹出时可视区会变矮，不限高并允许内部滚动的话确认按钮会被顶到屏幕外 */
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 20px 22px 18px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

/* 铺满整屏做专注模式：不留边距，圆角、投影、遮罩都收掉，看上去就是一整页白纸。
   用 100% 而不是 100vw/100dvh：父级 fixed inset:0 就是视口，100vw 在带滚动条的浏览器里会溢出 */
.dlg__card--full {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
}

.dlg__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

/* 绝对定位于卡片右上角，标题给右侧留出空间避免长标题压到它 */
.dlg__close {
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

.dlg__close:hover {
  color: #1f2329;
  background: #f2f3f5;
}

/* 同样是绝对定位，跟在 × 左边 */
.dlg__head-extra {
  position: absolute;
  top: 10px;
  right: 42px;
  display: flex;
  align-items: center;
  gap: 2px;
}

.dlg__title {
  /* 下边距交给 .dlg__head，间距和以前一样 */
  margin: 0;
  /* 唯一在流内的子项，撑满整行；min-width 归零让长标题可以换行而不是把按钮顶出去 */
  flex: 1;
  min-width: 0;
  padding-right: 26px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
}

/* 有额外按钮时把标题的右边界推到它们左边，长标题就只会换行而不会压上去 */
.dlg__title--extra {
  padding-right: 70px;
}

.dlg__body {
  font-size: 14px;
  color: #4b5563;
}

/* 不用 justify-content: flex-end，改由左侧容器的 margin-right: auto 把按钮顶到右边；
   左侧为空时效果和 flex-end 完全一致，所以没用这个插槽的弹窗布局不变 */
.dlg__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
}

.dlg__footer-left {
  display: flex;
  align-items: center;
  margin-right: auto;
  gap: 8px;
}

.dlg__btn {
  padding: 7px 18px;
  font-size: 13px;
  color: #1f2329;
  background: #fff;
  border: 1px solid #dcdcdc;
  border-radius: 6px;
  cursor: pointer;
}

.dlg__btn:hover:not(:disabled) {
  border-color: #b9bec6;
}

.dlg__btn--primary {
  color: #fff;
  background: #0052d9;
  border-color: #0052d9;
}

.dlg__btn--primary:hover:not(:disabled) {
  background: #0046bd;
  border-color: #0046bd;
}

.dlg__btn--danger {
  background: #d54941;
  border-color: #d54941;
}

.dlg__btn--danger:hover:not(:disabled) {
  background: #bb3d36;
  border-color: #bb3d36;
}

.dlg__btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 以下全屏态覆盖统一放最后，靠源码顺序压过上面的基础规则 */

/* 头部、正文、底栏共用同一列宽并居中：宽屏上标题贴左、正文居中会显得割裂。
   卡片留白交给 padding，这一列在留白内侧居中 */
.dlg__card--full .dlg__head,
.dlg__card--full .dlg__body,
.dlg__card--full .dlg__footer {
  width: 100%;
  max-width: 820px;
  margin-inline: auto;
}

/* 头部按钮改回参与排列（偏移量随之作废），才能跟着上面那一列走；不许被标题挤扁 */
.dlg__card--full .dlg__head-extra,
.dlg__card--full .dlg__close {
  position: static;
  flex-shrink: 0;
}

/* 按钮进流了，标题不再需要为绝对定位的按钮留位置 */
.dlg__card--full .dlg__title {
  padding-right: 12px;
}

/* 正文吃掉剩余高度，里面的编辑器（flex: 1）才能跟着长 */
.dlg__card--full .dlg__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 只有正文该伸缩，这两条留原高，视口再矮也不挤扁 */
.dlg__card--full .dlg__head,
.dlg__card--full .dlg__footer {
  flex-shrink: 0;
}
</style>
