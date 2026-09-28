<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import type { Backup } from '@/api/backup';
import AppDialog from '@/components/AppDialog.vue';
import { NARROW_QUERY } from '@/constants/file';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const props = defineProps<{
  item: Backup;
  modelValue: string;
  loading: boolean;
  saving: boolean;
  error: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [v: string];
  /** close: 存完是否收起弹窗。Ctrl+S 要留在原地继续改，所以由按键自己决定 */
  save: [opts: { close: boolean }];
  copy: [];
  download: [];
  close: [];
}>();

const editor = ref<HTMLTextAreaElement>();

const narrow = useMediaQuery(NARROW_QUERY);

/**
 * 每次打开重置：编辑器是 v-if 渲染的，不做跨文件记忆。
 * 窄屏（手机）默认直接进全屏专注模式 —— 小屏上弹窗外框、标题栏、圆角纯属浪费，
 * 而且 60vh 的正文区在手机上只有半屏可读。桌面端维持窗口态，按 Ctrl+L 或点右上角图标再进。
 *
 * 只取 setup 那一刻的值，之后视口变了也不跟着切：改到一半转屏就把编辑器弹回窗口态太打断。
 */
const fullscreen = ref(narrow.value);

/**
 * 读完后自动聚焦到开头。
 * 等 loading 落下再聚焦：这段时间 textarea 还没渲染（骨架是 hint），
 * 此时 ref 是空的，而且聚焦后光标位置会被随后写入的 value 重置。
 */
watch(
  () => props.loading,
  async (loading) => {
    if (loading) return;

    await nextTick();
    editor.value?.focus();
    // focus 默认把光标丢到末尾，这里按需求放回开头
    editor.value?.setSelectionRange(0, 0);
  },
);

/**
 * Ctrl/Cmd+L 切换全屏、Ctrl/Cmd+S 保存（不关弹窗）、Ctrl/Cmd+Enter 保存并关闭。
 * 挂在 window 上而不是 textarea 的 @keydown：
 * 焦点跑丢时（比如点了底栏的「复制」，button 拿到焦点）快捷键也该照常能用。
 * 组件本身是 v-if 渲染的，监听器的生命周期就等于编辑器打开的时间。
 */
function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return;

  const key = e.key.toLowerCase();

  if (key === 'l') {
    // 不拦的话焦点会被浏览器抢去地址栏
    e.preventDefault();
    fullscreen.value = !fullscreen.value;
    return;
  }

  if (key !== 's' && key !== 'enter') return;

  // Ctrl+S 不拦浏览器会弹「保存网页」
  e.preventDefault();

  // 内容还没读回来（或者读失败）时保存会把文件清空
  if (props.loading || props.error) return;

  emit('save', { close: key === 'enter' });
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<!-- 复用 AppDialog 当壳：右上角的 ×、Esc、点遮罩关闭都是现成的 -->
<template>
  <AppDialog
    :title="item.name ?? '文本'"
    confirm-text="保存"
    :loading="saving"
    :width="820"
    :fullscreen="fullscreen"
    :class="{ 'td--full': fullscreen }"
    @confirm="emit('save', { close: true })"
    @cancel="emit('close')"
  >
    <template #header-extra>
      <button
        class="td__icon"
        type="button"
        :title="fullscreen ? '退出全屏（Ctrl+L）' : '全屏（Ctrl+L）'"
        :aria-label="fullscreen ? '退出全屏' : '全屏'"
        @click="fullscreen = !fullscreen"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <template v-if="fullscreen">
            <path d="M4 14h6v6" />
            <path d="M20 10h-6V4" />
            <path d="M14 10l7-7" />
            <path d="M3 21l7-7" />
          </template>
          <template v-else>
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </template>
        </svg>
      </button>
    </template>

    <p v-if="loading" class="td__hint">加载中…</p>
    <p v-else-if="error" class="td__hint td__hint--error">{{ error }}</p>
    <textarea
      v-else
      ref="editor"
      :value="modelValue"
      class="td__editor"
      spellcheck="false"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <!-- 放进底栏左侧，和右边的「取消/保存」同一行 -->
    <template #footer-left>
      <button class="fm__btn" type="button" @click="emit('copy')">复制</button>
      <button class="fm__btn" type="button" @click="emit('download')">下载</button>
    </template>
  </AppDialog>
</template>

<style scoped>
/* 三种状态（加载中 / 出错 / 内容）都占同一个高度，切换时才不会让弹窗跳一下 */
.td__editor,
.td__hint {
  height: 60vh;
}

/* 和 AppDialog 的 × 同一副长相 */
.td__icon {
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

.td__icon:hover {
  color: #1f2329;
  background: #f2f3f5;
}

.td__editor {
  display: block;
  width: 100%;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #1f2329;
  /* 代码缩进用空格；pre-wrap 在保留缩进和原有换行的前提下让长行折行，不再撑出横向滚动条 */
  tab-size: 2;
  white-space: pre-wrap;
  /* 整行没有空格的（base64、长 URL、压缩过的 JSON）也要能断，否则照样横向溢出 */
  overflow-wrap: anywhere;
  overflow: auto;
  resize: none;
  border: 1px solid #dcdcdc;
  border-radius: 6px;
  outline: none;
}

.td__hint {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 13px;
  color: #a1a7b0;
}

.td__hint--error {
  color: #d54941;
}

/* 以下全屏态的覆盖统一放最后：基础规则在上面，靠源码顺序定胜负，不依赖特异性。
   .td--full 挂在 AppDialog 的根节点上，子组件根节点会同时带父组件的 scope id，所以选得中 */

/* 高度改由正文区分配，60vh 会把下半屏留空 */
.td--full .td__editor,
.td--full .td__hint {
  flex: 1;
  height: auto;
  min-height: 0;
}

/* 专注模式：输入框不留边框，整屏连成一片；滚动条也不画，内容照旧能滚
   （滚轮、翻页键、Ctrl+Home/End）。
   边框用透明色而不是 border: none —— 保住这 1px 的盒子，切换全屏时文字不会跳一下；
   滚动条两套写法都留着，Chrome 121+ 认标准属性，更老的 WebKit 只认伪元素 */
.td--full .td__editor {
  border-color: transparent;
  scrollbar-width: none;
}

.td--full .td__editor::-webkit-scrollbar {
  display: none;
}
</style>
