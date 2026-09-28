<script setup lang="ts">
import { watch } from 'vue';

import type { Backup } from '@/api/backup';
import type { NavKey } from '@/constants/file';
import type { FolderStats } from '@/hooks/useFolderStats';
import { useLongPress } from '@/hooks/useLongPress';
import { formatBytes, titleOf } from '@/utils/file';

const props = withDefaults(
  defineProps<{
    navKey: NavKey;
    stats: FolderStats;
    /** 钉在侧边栏的文件夹，按加入顺序 */
    folders?: Backup[];
    /** 当前所在目录命中的那个钉住项，没有则为空串。祖先链由页面从面包屑里算 */
    activePinId?: string;
    touch?: boolean;
  }>(),
  { folders: () => [], activePinId: '', touch: false },
);

const emit = defineEmits<{
  select: [key: NavKey];
  home: [];
  open: [id: string];
  contextMenu: [item: Backup, x: number, y: number];
}>();

// public 下的文件不经过打包处理，必须手动拼 base ——
// 写死 "/logo.png" 的话，部署到 /files 这种子路径下会 404
const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

/**
 * 长按等价于右键。窄屏下侧边栏在抽屉里，没有右键，不挂这个就永远够不到「取消收藏」。
 * 计时器是异步触发的，那时 e.currentTarget 已经是 null，坐标必须在同步的这一层算好。
 */
const longPress = useLongPress<Backup>((item, e) => {
  // 手指会挡住菜单，往下挪一点
  emit('contextMenu', item, e.clientX, e.clientY + 12);
});

// 长按只在触摸端启用：桌面鼠标有右键，而按住不放会跟别的交互抢手势
function onPinnedPointerDown(e: PointerEvent, item: Backup) {
  if (!props.touch) return;
  longPress.press(e, item);
}

function onPinnedClick(item: Backup) {
  // 长按已经开了菜单，跟着来的那次 click 不能再导航
  if (longPress.consumeClick()) return;

  emit('open', item.id ?? '');
}

function onPinnedContextMenu(item: Backup, e: MouseEvent) {
  e.preventDefault();
  // 触摸端的菜单由长按计时器负责，不 return 会开两次
  if (props.touch) return;

  // 键盘触发（菜单键 / Shift+F10）时 clientX/clientY 都是 0，用按钮位置兜底
  const rect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect();
  emit(
    'contextMenu',
    item,
    e.clientX || (rect ? rect.left + 24 : 0),
    e.clientY || (rect ? rect.top + rect.height : 0),
  );
}

// 列表重建后，残留的计时器会对着已经不存在的项开菜单
watch(
  () => props.folders,
  () => longPress.cancel(),
);
</script>

<template>
  <aside class="fm__sidebar">
    <button class="fm__brand" type="button" @click="emit('home')">
      <img class="fm__brand-logo" :src="logoSrc" alt="" />
      Zost Files
    </button>

    <nav class="fm__nav">
      <!-- 进了钉住的文件夹（或它的子目录）时它已经高亮，这里就让开，免得亮两项 -->
      <button
        class="fm__nav-item"
        :class="{ 'fm__nav-item--active': navKey === 'all' && !activePinId }"
        type="button"
        @click="emit('select', 'all')"
      >
        我的文件
      </button>

      <!--
        钉住的文件夹。平铺、不加分组标题 —— 它们和「我的文件」本来就是同一种东西：
        一个跳转入口。title 和列表里的名字用同一套「名字 - 描述」。
      -->
      <button
        v-for="folder in folders"
        :key="folder.id"
        class="fm__nav-item"
        :class="{ 'fm__nav-item--active': folder.id === activePinId }"
        type="button"
        :title="titleOf(folder)"
        @click="onPinnedClick(folder)"
        @contextmenu="onPinnedContextMenu(folder, $event)"
        @pointerdown="onPinnedPointerDown($event, folder)"
        @pointermove="longPress.move"
        @pointerup="longPress.release"
        @pointercancel="longPress.cancel"
      >
        {{ folder.name }}
      </button>
    </nav>

    <div class="fm__storage" title="统计不含回收站内容">
      <span class="fm__storage-title">存储空间</span>
      <span class="fm__storage-detail">{{ stats.fileCount }} 个文件共 {{ formatBytes(stats.totalSize) }}</span>
    </div>
  </aside>
</template>

<style scoped>
.fm__sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 220px;
  /* 下内边距必须是 0：存储空间那一块要和内容区底部那些条（同高——都读 --fm-bottombar-h，
     别在这里写死数值——同样贴底）齐平，留 12px 的话文字会整条抬高 12px。
     留白由那块自己的行高给 */
  padding: 20px 12px 0;
  background: #fafbfc;
  border-right: 1px solid #e7e8ea;
}

/* 20px 间距走 margin 而不是 padding：按钮的 padding 也在点击/悬停范围内，
   留在按钮里会导致鼠标停在文字下方的空白处也跟着高亮 */
.fm__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 20px;
  padding: 0 8px;
  font-family: inherit; /* button 不继承字体，不写会掉回浏览器默认字体 */
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: inherit;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}

.fm__brand:hover {
  color: #0052d9;
}

/*
  图片是 341×341 的正方形，但云本身只占中间 256 的高度（上下各约 42px 透明留白），
  所以这里的 height 是"盒子高"而不是"云高" —— 21px 的盒子画出来正好是 21×16 的云，
  和用贴合图时 height: 16px 的效果一致。
*/
.fm__brand-logo {
  flex-shrink: 0;
  width: auto;
  height: 21px;
  object-fit: contain;
}

.fm__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 钉多了要能滚，否则 .fm__nav 会一直长下去、把底部「存储空间」挤出可视区。
     min-height: 0 也是必需的：flex 子项默认 min-height: auto，不显式清掉就顶住不收缩 */
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 8px;
}

.fm__nav-item {
  padding: 9px 12px;
  font-size: 14px;
  color: #4b5563;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.fm__nav-item:hover {
  background: #eef0f3;
}

.fm__nav-item--active {
  color: #0052d9;
  font-weight: 500;
  background: #e8f0fe;
}

/* 高度和内容区底部那几条对齐（见 main.css 的 --fm-bottombar-h）。
   原来靠 14px/8px 的上下内边距撑出来，实际高度跟着字体度量走，对不齐 */
.fm__storage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  /* 高度必须钉死，不能跟着 .fm__nav 一起被压缩 —— 它要和内容区底部那几条对齐 */
  flex-shrink: 0;
  height: var(--fm-bottombar-h);
  margin-top: auto;
  padding: 0 8px;
}

.fm__storage-title {
  flex-shrink: 0;
  font-size: 12px;
  color: #8b929c;
}

/* 侧边栏只有 220px 宽，文件名数量大时长文本要能截断 */
.fm__storage-detail {
  overflow: hidden;
  font-size: 12px;
  color: #1f2329;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
