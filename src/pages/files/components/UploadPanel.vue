<script setup lang="ts">
import { computed } from 'vue';

import type { DirectUploadItem, DirectUploadStatus } from '@/hooks/useDirectUpload';
import { formatBytes } from '@/utils/file';

const props = defineProps<{
  items: DirectUploadItem[];
  /** 直传进行中。决定显示「取消」还是「关闭」，也决定标题文案 */
  active: boolean;
}>();

const emit = defineEmits<{ cancel: []; close: [] }>();

const doneCount = computed(
  () =>
    props.items.filter((it) => it.status === 'success' || it.status === 'failed' || it.status === 'canceled')
      .length,
);
const failedCount = computed(() => props.items.filter((it) => it.status === 'failed').length);
const canceledCount = computed(() => props.items.filter((it) => it.status === 'canceled').length);

const title = computed(() => {
  if (props.active) return `正在上传 ${doneCount.value}/${props.items.length}`;
  if (failedCount.value) return `${props.items.length - failedCount.value} 个已完成，${failedCount.value} 个失败`;
  if (canceledCount.value) return '上传已取消';
  return `已上传 ${props.items.length} 个文件`;
});

const STATUS_TEXT: Record<DirectUploadStatus, string> = {
  pending: '等待中',
  uploading: '上传中',
  uploaded: '待登记',
  committing: '处理中',
  success: '已完成',
  failed: '失败',
  canceled: '已取消',
};

function statusText(it: DirectUploadItem) {
  return it.status === 'uploading' ? `${Math.round(it.progress * 100)}%` : STATUS_TEXT[it.status];
}

/** 目录部分单独拆出来渲染：长路径优先压缩目录，文件名要完整可见 */
function dirOf(path: string) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function baseOf(path: string) {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}
</script>

<template>
  <aside class="fm__upload">
    <header class="fm__upload-head">
      <span class="fm__upload-title">{{ title }}</span>
      <button v-if="active" class="fm__mini" type="button" @click="emit('cancel')">取消</button>
      <!-- 图标按钮必须带 aria-label：里面没有文字，读屏只会念出"按钮" -->
      <button v-else class="fm__upload-close" type="button" aria-label="关闭" @click="emit('close')">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <ul class="fm__upload-list">
      <li v-for="(it, i) in items" :key="`${it.path}-${i}`" class="fm__upload-item">
        <div class="fm__upload-line">
          <span class="fm__upload-name" :title="it.path">
            <span v-if="dirOf(it.path)" class="fm__upload-dir">{{ dirOf(it.path) }}/</span>
            <span class="fm__upload-base">{{ baseOf(it.path) }}</span>
          </span>
          <span
            class="fm__upload-status"
            :class="{
              'fm__upload-status--ok': it.status === 'success',
              'fm__upload-status--bad': it.status === 'failed',
            }"
          >
            {{ statusText(it) }}
          </span>
        </div>

        <div class="fm__upload-meta">
          <span>{{ formatBytes(it.file.size) }}</span>
          <span v-if="it.error" class="fm__upload-error">{{ it.error }}</span>
        </div>

        <!--
          进度条槽位**一直占着**，只在非上传时隐藏（不是 v-if 删掉）。
          删掉的话这一条会随之上下一跳：它自己是最后一个子元素，会被下面所有条目跟着跳，
          而这里又是 max-height + overflow 的滚动容器，跳动会被放大成"滚动条乱晃"。
          始终占位 = 每个 item 的高度恒定，这也是不写死一个 px 高度的原因——
          写死的话字体度量一变就把内容挤出/压塌，而"槽位常在"天然就是那个固定高度。
        -->
        <div class="fm__upload-bar" :class="{ 'fm__upload-bar--idle': it.status !== 'uploading' }">
          <div class="fm__upload-bar-fill" :style="{ width: `${Math.round(it.progress * 100)}%` }" />
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
/* 浮在内容区右下角：不是文档流里的一条，所以不会把底部的详情条/多选条挤走。
   抬起 --fm-bottombar-h 是为了压在那一条之上而不是盖住它 */
.fm__upload {
  position: absolute;
  right: 16px;
  bottom: calc(var(--fm-bottombar-h) + 16px);
  z-index: 20;
  width: 340px;
  max-width: calc(100% - 32px);
  /* 下内边距比上/左/右小 6px：最后一条那个常驻的进度条槽位自带 9px（6 margin + 3 高），
     不抵消的话面板底部会比顶部空出一截。12 - 6 = 6，加上槽位的 9 是 15px，
     和顶部到标题的 12px 接近；进度条真正显示时离下边框还有 6px，不至于贴着圆角 */
  padding: 12px 12px 6px;
  background: #fff;
  border: 1px solid #e7e8ea;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(31, 35, 41, 0.12);
}

/*
  固定 24px 高：右侧的按钮在上传中是文字「取消」（约 18px 高）、结束后是图标 ×（24px），
  不固定的话上传结束那一刻整块面板会跟着长高 6px —— 跟进度条槽位是同一类抖动
*/
.fm__upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 24px;
  margin-bottom: 8px;
}

/* 和 AppDialog 的 .dlg__close 同一套观感：灰、悬停变深 + 浅底 */
.fm__upload-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  /* 往右挪 4px：图标自带约 4px 的视觉留白，不挪的话它比下面的文字看着更靠里 */
  margin-right: -4px;
  color: #8b929c;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.fm__upload-close:hover {
  color: #1f2329;
  background: #f2f3f5;
}

.fm__upload-title {
  font-size: 13px;
  font-weight: 500;
  color: #1f2329;
}

/* 超过约 4 项就滚动，不然一屏能长到把文件列表整个盖住 */
.fm__upload-list {
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.fm__upload-item + .fm__upload-item {
  margin-top: 10px;
}

.fm__upload-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 长名字先压目录、再压文件名：这样同名不同目录的文件也能一眼分清是哪一个 */
.fm__upload-name {
  display: flex;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #1f2329;
}

.fm__upload-dir {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: #8b929c;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm__upload-base {
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm__upload-status {
  flex-shrink: 0;
  font-size: 12px;
  color: #8b929c;
}

/*
  刻意和上面 .fm__upload-status 的默认色一样：完成是"正常结果"，不该被强调，
  一整批成功时也不该是一片颜色。真正需要跳出来的是失败（红）和还在跑的每一项。
  这一条留着是为了让模板里 success / failed 两个分支对称，也留个调色的位置。
*/
.fm__upload-status--ok {
  color: #8b929c;
}

.fm__upload-status--bad {
  color: #d54941;
}

.fm__upload-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
  color: #8b929c;
}

/* 失败原因可能很长（后端会带上目录名等），单行截断，完整内容看 title */
.fm__upload-error {
  min-width: 0;
  overflow: hidden;
  color: #d54941;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm__upload-bar {
  height: 3px;
  margin-top: 6px;
  overflow: hidden;
  background: #eef0f3;
  border-radius: 2px;
}

/* 不在传的时候把整条槽位隐掉（连同浅灰底），但高度照占 */
.fm__upload-bar--idle {
  opacity: 0;
}

.fm__upload-bar-fill {
  height: 100%;
  background: #0052d9;
  border-radius: 2px;
  /*
    0.1s = 进度回写的节流间隔（useDirectUpload 的 PROGRESS_INTERVAL_MS）：
    每次宽度变化刚好赶在下一次更新到达时走完，接起来就是连续推进，没有台阶感。
    用 linear 而不是 ease —— 每一步都做一次加减速，逐帧看反而是"一蹦一蹦"。
  */
  transition: width 0.1s linear;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .fm__upload {
    /* 340px 在 375px 屏上勉强够，但贴边太紧；左右各留 12px */
    right: 12px;
    bottom: calc(var(--fm-bottombar-h) + 12px);
    width: auto;
    max-width: none;
    left: 12px;
  }
}
</style>
