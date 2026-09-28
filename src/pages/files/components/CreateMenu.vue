<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { filesFromInput } from '@/utils/fs-entry';
import type { UploadTree } from '@/utils/fs-entry';

const props = defineProps<{
  /** 上传中时只禁掉两项上传，新建那两个照旧可用 —— 上传是后台任务，不该把新建也锁上 */
  uploading: boolean;
}>();

const emit = defineEmits<{
  files: [files: File[]];
  filesTree: [tree: UploadTree];
  createFolder: [];
  createFile: [];
}>();

const root = ref<HTMLElement>();
const open = ref(false);

const fileInput = ref<HTMLInputElement>();
const dirInput = ref<HTMLInputElement>();

// iOS Safari 不支持 webkitdirectory，那个入口点开是静默死路。用能力检测而不是 UA 嗅探
const canPickFolder = 'webkitdirectory' in document.createElement('input');

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

function pickFiles() {
  open.value = false;
  fileInput.value?.click();
}

function pickFolder() {
  open.value = false;
  dirInput.value?.click();
}

function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  // 清空 value：同一个文件连着选两次也要能触发 change
  input.value = '';
  emit('files', files);
}

function onFolderPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  emit('filesTree', filesFromInput(files));
}

function createFolder() {
  open.value = false;
  emit('createFolder');
}

function createFile() {
  open.value = false;
  emit('createFile');
}
</script>

<!-- 四个新建/上传入口收在一个「+」里，宽窄屏共用 —— 右侧省下的地方留给搜索框和面包屑 -->
<template>
  <div ref="root" class="cm-wrap">
    <input ref="fileInput" class="cm-input" type="file" multiple @change="onFilesPicked" />
    <input ref="dirInput" class="cm-input" type="file" webkitdirectory multiple @change="onFolderPicked" />

    <button
      class="cm-trigger"
      type="button"
      title="上传或新建"
      aria-label="上传或新建"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
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
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>

    <div v-if="open" class="cm-menu">
      <button class="cm-item" type="button" :disabled="props.uploading" @click="pickFiles">上传</button>
      <button v-if="canPickFolder" class="cm-item" type="button" :disabled="props.uploading" @click="pickFolder">
        上传文件夹
      </button>
      <button class="cm-item" type="button" @click="createFolder">新建文件夹</button>
      <button class="cm-item" type="button" @click="createFile">新建文件</button>
    </div>
  </div>
</template>

<style scoped>
.cm-wrap {
  position: relative;
  flex-shrink: 0;
}

.cm-input {
  display: none;
}

/*
 * 纯图标按钮。底色用 #f5f6f8 —— 和紧挨着的搜索框、视图切换那组是同一档灰，
 * 这样它有块看得见的「面」，不是一枚浮在空白里的字形。
 * 刻意不套 .fm__btn：那是文字按钮的样式（白底、#dcdcdc 描边、近黑的 color），
 * 三个都得盖掉，不如直接写全。
 */
.cm-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  color: #8b929c;
  background: #f5f6f8;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.cm-trigger:hover {
  color: #0052d9;
  background: #f0f5ff;
}

.cm-menu {
  position: absolute;
  top: 36px; /* 32 的按钮 + 4 的间距 */
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

.cm-item {
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

.cm-item:hover:not(:disabled) {
  background: #f5f6f8;
}

/* 和 .fm__btn:disabled 同一套灰，两处看起来才是同一个禁用态 */
.cm-item:disabled {
  color: #c4c8ce;
  cursor: not-allowed;
}

/* ---------- 触摸设备（TOUCH_QUERY = hover: none） ---------- */
@media (hover: none) {
  /* 菜单项在触摸屏上要够大才好点 */
  .cm-item {
    padding: 10px;
  }
}
</style>
