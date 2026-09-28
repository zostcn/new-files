<script setup lang="ts">
  import { computed, ref } from "vue";

  import type { PathNode } from '@/api/backup';
  import type { ViewMode } from "@/constants/file";
  import type { UploadTree } from "@/utils/fs-entry";

  import CreateMenu from "./CreateMenu.vue";

  const props = defineProps<{
    isTrash: boolean;
    keyword: string;
    viewMode: ViewMode;
    pathNodes: PathNode[];
    dragOverTarget: string | null;
    uploading: boolean;
    /** 回收站里的根节点数，0 表示空，用来禁用清空按钮 */
    trashCount: number;
    collapsed: boolean;
    narrow: boolean;
    drawerOpen: boolean;
  }>();

  // pathNodes 首项恒为根节点，根目录已由「首页」表示，这一级不再重复渲染
  const trail = computed(() => props.pathNodes.slice(1));

  // 窄屏的"展开"指抽屉，宽屏指内联折叠 —— 两者是分开的状态
  const sidebarExpanded = computed(() =>
    props.narrow ? props.drawerOpen : !props.collapsed,
  );

  const emit = defineEmits<{
    "update:keyword": [v: string];
    "update:viewMode": [m: ViewMode];
    files: [files: File[]];
    filesTree: [tree: UploadTree];
    createFolder: [];
    createFile: [];
    goToPath: [id: string];
    dragOverInto: [e: DragEvent, targetId: string];
    dragLeaveInto: [e: DragEvent];
    dropInto: [e: DragEvent, targetId: string];
    emptyRecycle: [];
    toggleSidebar: [];
  }>();

  const searchInput = ref<HTMLInputElement>();

  /**
   * 供页面级快捷键调用，返回是否真的聚焦上了。
   * 回收站模式没有搜索框（/recycle/list 不支持关键词），此时返回 false，
   * 调用方就不会拦 Ctrl+F，浏览器自带的查找照常可用。
   * 聚焦时顺带全选，Ctrl+F 后直接输入就能替换旧关键词。
   */
  function focusSearch() {
    if (!searchInput.value) return false;

    searchInput.value.focus();
    searchInput.value.select();
    return true;
  }

  defineExpose({ focusSearch });
</script>

<template>
  <header class="fm__topbar">
    <button
      class="fm__collapse"
      type="button"
      :title="sidebarExpanded ? '收起侧边栏' : '展开侧边栏'"
      :aria-expanded="sidebarExpanded"
      @click="emit('toggleSidebar')"
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
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <nav class="fm__breadcrumb">
      <button
        class="fm__crumb"
        :class="{ 'fm__crumb--drop': dragOverTarget === '' }"
        type="button"
        @click="emit('goToPath', '')"
        @dragover="emit('dragOverInto', $event, '')"
        @dragleave="emit('dragLeaveInto', $event)"
        @drop="emit('dropInto', $event, '')"
      >
        根目录
      </button>

      <!-- 回收站没有层级，trail 是空的，所以下面这段 v-for 自然不渲染 -->
      <template v-if="isTrash">
        <span class="fm__sep">/</span>
        <span class="fm__crumb fm__crumb--current">回收站</span>
      </template>

      <template v-for="(n, i) in trail" :key="n.id">
        <span class="fm__sep">/</span>
        <button
          class="fm__crumb"
          :class="{
            'fm__crumb--current': i === trail.length - 1,
            'fm__crumb--drop': dragOverTarget === n.id,
          }"
          type="button"
          @click="emit('goToPath', n.id ?? '')"
          @dragover="emit('dragOverInto', $event, n.id ?? '')"
          @dragleave="emit('dragLeaveInto', $event)"
          @drop="emit('dropInto', $event, n.id ?? '')"
        >
          {{ n.name }}
        </button>
      </template>
    </nav>

    <div class="fm__actions">
      <button
        v-if="isTrash"
        class="fm__btn fm__btn--danger"
        type="button"
        :disabled="!trashCount"
        @click="emit('emptyRecycle')"
      >
        清空回收站
      </button>
      <!-- 回收站列表接口不支持关键词，放个搜不了的框只会误导 -->
      <div v-if="!isTrash" class="fm__searchbox">
        <svg
          class="fm__search-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.2-3.2" />
        </svg>
        <input
          ref="searchInput"
          :value="keyword"
          class="fm__search"
          type="search"
          placeholder="搜索文件"
          @input="
            emit('update:keyword', ($event.target as HTMLInputElement).value)
          "
        />
      </div>

      <CreateMenu
        v-if="!isTrash"
        class="fm__create"
        :uploading="uploading"
        @files="emit('files', $event)"
        @files-tree="emit('filesTree', $event)"
        @create-folder="emit('createFolder')"
        @create-file="emit('createFile')"
      />

      <div class="fm__view-toggle">
        <button
          class="fm__view-btn"
          :class="{ 'fm__view-btn--active': viewMode === 'list' }"
          type="button"
          title="列表视图"
          @click="emit('update:viewMode', 'list')"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
          </svg>
        </button>
        <button
          class="fm__view-btn"
          :class="{ 'fm__view-btn--active': viewMode === 'grid' }"
          type="button"
          title="大图标视图"
          @click="emit('update:viewMode', 'grid')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
            <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
            <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
            <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
          </svg>
        </button>
      </div>
    </div>

    <!--
      账号菜单由页面注入，工具栏本身不关心登录态。
      它必须是顶栏的直接子元素（而不是塞在 .fm__actions 里）——
      窄屏要用 order 把它排到第一行，而 order 不能跨父元素生效。
      放在操作区之后，桌面端仍然是最右侧。
    -->
    <div class="fm__account">
      <slot name="account" />
    </div>
  </header>
</template>

<style scoped>
  /* 固定高度：两种模式右侧都只有一个 32px 的按钮（「+」/「清空回收站」），
   正常模式和回收站切换时这条栏的高度不会跳 */
  /* 不用 space-between：面包屑 flex: 1 自己占满中间，把右侧操作区推过去，
   这样再加左侧图标也不会把面包屑挤到中间 */
  .fm__topbar {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 12px;
    height: 60px;
    padding: 0 12px;
    border-bottom: 1px solid #e7e8ea;
  }

  .fm__collapse {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    color: #8b929c;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .fm__collapse:hover {
    color: #0052d9;
    background: #f0f5ff;
  }

  .fm__breadcrumb {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
  }

  .fm__account {
    flex-shrink: 0;
    /* 账号菜单从 .fm__actions 里挪出来了（窄屏要用 order 排到第一行，而 order 不能跨父元素），
     但顶栏的 gap 是 12px、操作区内部是 8px，所以左移 4px 把桌面端的间距还原 */
    margin-left: -4px;
  }

  .fm__crumb {
    flex-shrink: 0;
    padding: 2px 4px;
    /* <button> 默认不继承字体，不写这行「首页」会掉回浏览器默认字体和 13.33px，
     而回收站那节是 <span>（继承 14px + 页面字体），两处就不一样了 */
    font: inherit;
    color: #4b5563;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .fm__crumb:hover {
    color: #0052d9;
    background: #eef0f3;
  }

  .fm__crumb--current {
    color: #1f2329;
    font-weight: 500;
  }

  .fm__crumb--drop {
    color: #0052d9;
    background: #e8f0fe;
  }

  .fm__sep {
    color: #c4c8ce;
  }

  .fm__actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 8px;
  }

  /* 框的尺寸归外层，输入框自己撑满 —— <input> 装不下子元素，前缀图标只能这么叠 */
  .fm__searchbox {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 180px;
  }

  .fm__search-icon {
    position: absolute;
    left: 9px;
    color: #8b929c;
    /* 图标压在输入框上，但它只是装饰：点它应该穿过自己去聚焦输入框 */
    pointer-events: none;
    /* 跟着输入框的聚焦态一起变蓝，整个框才像一个整体 */
    transition: color 0.15s;
  }

  .fm__searchbox:focus-within .fm__search-icon {
    color: #0052d9;
  }

  .fm__search {
    width: 100%;
    height: 32px;
    /* 左边让给图标：9px 起点 + 16px 图标 + 7px 间距 */
    padding: 0 12px 0 32px;
    font-size: 13px;
    color: #1f2329;
    background: #f5f6f8;
    border: 1px solid transparent;
    border-radius: 6px;
    outline: none;
  }

  .fm__search:focus {
    background: #fff;
    border-color: #0052d9;
  }

  /* ---------- 视图切换 ---------- */
  .fm__view-toggle {
    display: flex;
    gap: 2px;
    height: 32px;
    padding: 2px;
    background: #f5f6f8;
    border-radius: 6px;
  }

  /* 28 + 上下各 2px 的内边距 = 32，与同一行的按钮、输入框齐平 */
  .fm__view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: #8b929c;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .fm__view-btn:hover {
    color: #0052d9;
  }

  .fm__view-btn--active {
    color: #0052d9;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  /* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
  @media (max-width: 640px) {
    /* 一行装不下（汉堡 + 面包屑 + 180px 搜索 + 「+」 + 头像），改成自动换行排两行 */
    .fm__topbar {
      flex-wrap: wrap;
      height: auto;
      min-height: 56px;
      padding: 8px 12px;
    }

    /*
     * 让 .fm__actions 这一层在窄屏「消失」：它的子元素（搜索框、「+」、视图切换）
     * 直接成为顶栏的 flex 子项，order 才能在它们和面包屑、头像之间生效 ——
     * order 只在同一个 flex 容器内比较，不跨父元素。
     * 宽屏不受影响，仍旧是 [搜索框] [+] [视图] 那一行。
     * 这一层本身没有 padding/border，所以丢掉它的盒子不损失任何东西。
     */
    .fm__actions {
      display: contents;
    }

    /* 行1：汉堡(order 默认 0) + 面包屑 + 「+」 + 头像 */
    .fm__breadcrumb {
      order: 1;
    }

    /* class 是从父组件透传到 CreateMenu 根元素上的：
       子组件的根元素同时带父组件的 scope id，所以这里能选中它 */
    .fm__create {
      order: 2;
    }

    .fm__account {
      order: 3;
    }

    /* 行2：搜索框占满一整行，宽度由外层容器给（见 .fm__searchbox） */
    .fm__searchbox {
      order: 4;
      flex: 1 1 100%;
      width: auto;
    }

    /* 已经强制卡片视图了，切换按钮没有意义 */
    .fm__view-toggle {
      display: none;
    }
  }

  /* ---------- 触摸设备（TOUCH_QUERY = hover: none） ---------- */
  @media (hover: none) {
    /* iOS Safari 聚焦字号小于 16px 的输入框时会自动放大整个页面，只有把字号提到 16px 才能避免。
     用 touch 判定而不是窄屏：iPad 横屏也会触发 */
    .fm__search {
      font-size: 16px;
    }

    /* 折叠/抽屉按钮是移动端的主导航入口，32px 在触摸屏上偏小 */
    .fm__collapse {
      width: 40px;
      height: 40px;
      /* 按钮撑到 40px 后，20px 的图标居中会自带约 10px 内边距，
       再叠上顶栏 12px 的间距，图标和面包屑之间看着就太远了 —— 往回收一点 */
      margin-right: -6px;
    }

    /* svg 的尺寸是写在标签属性上的，CSS 的 width/height 能覆盖它 */
    .fm__collapse svg {
      width: 20px;
      height: 20px;
    }
  }
</style>
