<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { ossThumbnail } from '@/utils/file';

const props = defineProps<{ avatar: string }>();

const emit = defineEmits<{ recycle: []; logout: [] }>();

const root = ref<HTMLElement>();
const open = ref(false);

// 头像加载失败（地址失效、存的是对象名等）就回落到默认图标
const avatarFailed = ref(false);
const showAvatar = computed(() => !!props.avatar && !avatarFailed.value);
// 只是 28px 的展示位，走 OSS 缩略图而不是原图
const avatarSrc = computed(() => ossThumbnail(props.avatar));

watch(
  () => props.avatar,
  () => {
    avatarFailed.value = false;
  },
);

// 用 mousedown 而不是 click：它先于按钮自身的 click 触发，
// 点空白处时不会和「打开/收起」的切换互相打架
function onDocumentMouseDown(e: MouseEvent) {
  if (!open.value) return;
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown);
  document.removeEventListener('keydown', onKeydown);
});

function recycle() {
  open.value = false;
  emit('recycle');
}

function logout() {
  open.value = false;
  emit('logout');
}
</script>

<template>
  <div ref="root" class="um">
    <button
      class="um__avatar"
      type="button"
      title="账号"
      aria-label="账号"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="um__avatar-inner">
        <img v-if="showAvatar" class="um__img" :src="avatarSrc" alt="" @error="avatarFailed = true" />
        <svg
          v-else
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </span>
    </button>

    <div v-if="open" class="um__menu">
      <button class="um__item" type="button" @click="recycle">回收站</button>
      <button class="um__item" type="button" @click="logout">退出登录</button>
    </div>
  </div>
</template>

<style scoped>
.um {
  position: relative;
  flex-shrink: 0;
}

.um__avatar {
  display: flex;
  width: 28px;
  height: 28px;
  /* 必须显式清零：<button> 有 UA 默认内边距（约 1px 6px），
     box-sizing: border-box 下会把内容盒压成 16×26 —— 头像图是 width/height:100%，
     就会变成非正方形的竖长条，再被 object-fit: cover 裁掉大半 */
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

.um__avatar-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #fff;
  background: #0052d9;
  border-radius: 50%;
  /* 圆形裁切放在 span 上而不是 <button> 上：
     iOS 上按钮的 overflow: hidden 不一定能裁住子元素，会露出方形 */
  overflow: hidden;
}

.um__avatar:hover .um__avatar-inner {
  background: #0046bd;
}

.um__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.um__menu {
  position: absolute;
  top: 36px; /* 28 的头像 + 8 的间距 */
  right: 0;
  /* 要盖住文件列表，得高于拖拽蒙层的 20 和多选浮层的 10 */
  z-index: 30;
  min-width: 120px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e7e8ea;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.um__item {
  display: block;
  width: 100%;
  padding: 8px 10px;
  font-family: inherit; /* button 不继承字体，不写会掉回浏览器默认字体 */
  font-size: 13px;
  color: #1f2329;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.um__item:hover {
  background: #f5f6f8;
}
</style>
