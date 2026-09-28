<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    x: number;
    y: number;
    items: Array<{ key: string; label: string; danger?: boolean }>;
    /**
     * 默认压在底部那几条（10）之上、弹窗（100）之下。
     * 从侧边栏里唤起的菜单要传更高，窄屏下侧边栏是 z-index 60 的抽屉，
     * 而菜单挂在 .fm 根上、在抽屉外面，不抬高会被整个盖住。
     */
    zIndex?: number;
  }>(),
  { zIndex: 50 },
);

const emit = defineEmits<{ select: [key: string]; close: [] }>();

const root = ref<HTMLElement>();
const pos = ref({ left: props.x, top: props.y });
const ready = ref(false);

const EDGE = 8;

/** 要贴边翻转就得知道菜单自身尺寸，而渲染前拿不到 —— 先隐藏渲染、量完再定位 */
async function place() {
  ready.value = false;
  pos.value = { left: props.x, top: props.y };
  await nextTick();

  const el = root.value;
  if (!el) return;

  pos.value = {
    left: Math.max(EDGE, Math.min(props.x, window.innerWidth - el.offsetWidth - EDGE)),
    top: Math.max(EDGE, Math.min(props.y, window.innerHeight - el.offsetHeight - EDGE)),
  };
  ready.value = true;
}

// 在别处再次右键要重新定位，所以跟着坐标走而不是只在挂载时算一次
watch(() => [props.x, props.y], place, { immediate: true });

function onDocumentMouseDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

// 滚动容器是 .fm__table 而不是 window，冒泡阶段收不到，必须用捕获
function onScroll() {
  emit('close');
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', onScroll, true);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('scroll', onScroll, true);
});
</script>

<template>
  <div
    ref="root"
    class="cm"
    :style="{
      left: `${pos.left}px`,
      top: `${pos.top}px`,
      zIndex: props.zIndex,
      visibility: ready ? 'visible' : 'hidden',
    }"
    @contextmenu.prevent
  >
    <button
      v-for="item in items"
      :key="item.key"
      class="cm__item"
      :class="{ 'cm__item--danger': item.danger }"
      type="button"
      @click="emit('select', item.key)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.cm {
  position: fixed;
  /* z-index 走行内样式（见 zIndex prop 的说明），这里不写死 */
  min-width: 140px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e7e8ea;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.cm__item {
  display: block;
  width: 100%;
  padding: 8px 10px;
  font-family: inherit; /* button 不继承字体，不写会掉回浏览器默认字体 */
  font-size: 13px;
  color: #1f2329;
  text-align: left;
  white-space: nowrap;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.cm__item--danger {
  color: #d54941;
}

.cm__item:hover {
  background: #f5f6f8;
}
</style>
