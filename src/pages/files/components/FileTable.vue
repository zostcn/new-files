<script setup lang="ts">
import { watch } from 'vue';

import type { Backup } from '@/api/backup';
import type { SortKey, ViewMode } from '@/constants/file';
import { useLongPress } from '@/hooks/useLongPress';
import { formatSize, kindOf, locationOf, titleOf, uploadTimeOf } from '@/utils/file';

import FileIcon from './FileIcon.vue';

const props = defineProps<{
  rows: Backup[];
  loading: boolean;
  isEmpty: boolean;
  viewMode: ViewMode;
  isTrash: boolean;
  /** 触摸设备：单击即打开、长按出菜单（双击和右键在触摸屏上不可用） */
  touch: boolean;
  /** 多选模式：默认隐藏勾选框，由右键菜单的「多选」进入（当前有选中项即为开启） */
  multiSelect: boolean;
  keyword: string;
  sortKey: SortKey;
  sortAsc: boolean;
  allSelected: boolean;
  selectedIds: string[];
  /** 单击设的当前项，只用于高亮和底部详情 */
  focusedId: string;
  dragIds: string[];
  dragOverTarget: string | null;
  failedThumbs: string[];
}>();

const emit = defineEmits<{
  sort: [k: SortKey];
  toggleSelectAll: [];
  toggleSelect: [id: string];
  focus: [item: Backup];
  clearFocus: [];
  open: [item: Backup];
  contextMenu: [item: Backup, x: number, y: number];
  itemDragStart: [e: DragEvent, item: Backup];
  itemDragEnd: [];
  dragOverInto: [e: DragEvent, targetId: string];
  dragLeaveInto: [e: DragEvent];
  dropInto: [e: DragEvent, targetId: string];
  thumbError: [id?: string];
}>();

function isDragging(item: Backup) {
  return props.dragIds.includes(item.id ?? '');
}

const thumbUrl = (item: Backup) => item.thumbnailUrl || item.url;

// 搜索结果脱离目录上下文、回收站脱离原目录，只有这两种情况显示所在位置
function location(item: Backup) {
  return locationOf(item, { searching: !!props.keyword.trim(), isTrash: props.isTrash });
}

/**
 * 长按等价于右键。这里只负责算出坐标再交给页面 —— 计时器是 500ms 后异步触发的，
 * 那时 e.currentTarget 已经是 null，所以位置必须在同步的这一层算好。
 */
const longPress = useLongPress<Backup>((item, e) => {
  // 手指会挡住菜单，往下挪一点
  emit('contextMenu', item, e.clientX, e.clientY + 12);
});

/**
 * 长按只在触摸端启用。桌面上鼠标有右键，而且按住不放会跟拖拽打架 ——
 * 原生拖拽一旦接管，pointermove 不再触发，位移判定失效，计时器照样会把菜单弹出来。
 */
function onRowPointerDown(e: PointerEvent, item: Backup) {
  if (!props.touch) return;
  longPress.press(e, item);
}

/**
 * 触摸端整体禁用拖动。行本身的 draggable 已经关掉了，这里再挡一道是因为
 * 行里的缩略图 <img> 是独立可拖的（父级的 draggable=false 管不到子元素），
 * 而 iOS 上的原生图片拖拽会和长按抢手势、还会画一个拖影出来。
 */
function onRowDragStart(e: DragEvent, item: Backup) {
  if (props.touch) return;
  emit('itemDragStart', e, item);
}

// 列表/网格切换或翻页后，残留的计时器会对着已经不存在的行开菜单
watch(
  () => props.rows,
  () => longPress.cancel(),
);

function onRowClick(item: Backup) {
  // 长按已经开了菜单，跟着来的那次 click 不能再打开
  if (longPress.consumeClick()) return;

  // 触摸屏上没有可靠的"双击"，单击直接打开
  if (props.touch) emit('open', item);
  else emit('focus', item);
}

function onRowDblClick(item: Backup) {
  // 触摸端已经用单击打开了；iOS 在双击时仍可能合成 dblclick，会重复导航
  if (props.touch) return;
  emit('open', item);
}

function onRowContextMenu(item: Backup, e: MouseEvent) {
  e.preventDefault();
  // 触摸端的菜单由长按计时器负责。不 return 的话原生 contextmenu 和计时器都会触发，菜单会开两次
  if (props.touch) return;

  // 键盘触发（菜单键 / Shift+F10）时 clientX/clientY 都是 0，用行的位置兜底
  const rect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect();
  emit(
    'contextMenu',
    item,
    e.clientX || (rect ? rect.left + 24 : 0),
    e.clientY || (rect ? rect.top + rect.height : 0),
  );
}
</script>

<template>
  <!-- 点空白处清掉当前项；表头要挡住，否则点排序也会把详情清掉 -->
  <div
    class="fm__table"
    :class="{ 'fm__table--multi': multiSelect }"
    @click="emit('clearFocus')"
  >
    <div class="fm__thead" :class="{ 'fm__thead--grid': viewMode === 'grid' }" @click.stop>
      <label class="fm__check">
        <input type="checkbox" :checked="allSelected" @change="emit('toggleSelectAll')" />
      </label>
      <button class="fm__th" type="button" @click="emit('sort', 'name')">
        名称
        <span class="fm__arrow">{{ sortKey === 'name' ? (sortAsc ? '↑' : '↓') : '' }}</span>
      </button>
      <button class="fm__th" type="button" @click="emit('sort', 'size')">
        大小
        <span class="fm__arrow">{{ sortKey === 'size' ? (sortAsc ? '↑' : '↓') : '' }}</span>
      </button>
      <button class="fm__th" type="button" @click="emit('sort', 'time')">
        上传时间
        <span class="fm__arrow">{{ sortKey === 'time' ? (sortAsc ? '↑' : '↓') : '' }}</span>
      </button>
    </div>

    <p v-if="loading" class="fm__loading">加载中…</p>

    <!-- 列表视图 -->
    <template v-else-if="viewMode === 'list'">
      <div
        v-for="row in rows"
        :key="row.id"
        class="fm__row"
        :class="{
          'fm__row--folder': row.isDir && !isTrash,
          'fm__row--focused': focusedId === (row.id ?? ''),
          'fm__row--dragging': isDragging(row),
          'fm__row--drop': dragOverTarget === row.id,
        }"
        :draggable="!isTrash && !touch"
        :title="titleOf(row)"
        @click.stop="onRowClick(row)"
        @dblclick="onRowDblClick(row)"
        @contextmenu="onRowContextMenu(row, $event)"
        @pointerdown="onRowPointerDown($event, row)"
        @pointermove="longPress.move"
        @pointerup="longPress.release"
        @pointercancel="longPress.cancel"
        @dragstart="onRowDragStart($event, row)"
        @dragend="emit('itemDragEnd')"
        @dragover="row.isDir && !isTrash && emit('dragOverInto', $event, row.id ?? '')"
        @dragleave="emit('dragLeaveInto', $event)"
        @drop="row.isDir && emit('dropInto', $event, row.id ?? '')"
      >
        <!-- dblclick 要单独挡：@click.stop 拦不住它，否则双击复选框会顺带打开文件。
             pointerdown 也要挡：按在复选框上不该弹行的长按菜单 -->
        <label class="fm__check" @click.stop @dblclick.stop @pointerdown.stop>
          <input type="checkbox" :checked="selectedIds.includes(row.id ?? '')" @change="emit('toggleSelect', row.id ?? '')" />
        </label>
        <div class="fm__cell fm__cell--name">
          <FileIcon
            :kind="kindOf(row)"
            :url="thumbUrl(row)"
            :name="row.name"
            :thumb-failed="failedThumbs.includes(row.id ?? '')"
            @thumb-error="emit('thumbError', row.id)"
          />
          <div class="fm__namebox">
            <span class="fm__name">{{ row.name }}</span>
            <span v-if="location(row)" class="fm__row-sub" :title="location(row)">{{ location(row) }}</span>
          </div>
        </div>
        <div class="fm__cell fm__cell--size">{{ formatSize(row) }}</div>
        <div class="fm__cell fm__cell--time">
          <span class="fm__time">{{ uploadTimeOf(row) || '--' }}</span>
        </div>
      </div>
    </template>

    <!-- 大图标视图 -->
    <div v-else class="fm__grid">

      <div
        v-for="row in rows"
        :key="row.id"
        class="fm__card"
        :class="{
          'fm__card--folder': row.isDir && !isTrash,
          'fm__card--focused': focusedId === (row.id ?? ''),
          'fm__card--dragging': isDragging(row),
          'fm__card--drop': dragOverTarget === row.id,
        }"
        :draggable="!isTrash && !touch"
        :title="titleOf(row)"
        @click.stop="onRowClick(row)"
        @dblclick="onRowDblClick(row)"
        @contextmenu="onRowContextMenu(row, $event)"
        @pointerdown="onRowPointerDown($event, row)"
        @pointermove="longPress.move"
        @pointerup="longPress.release"
        @pointercancel="longPress.cancel"
        @dragstart="onRowDragStart($event, row)"
        @dragend="emit('itemDragEnd')"
        @dragover="row.isDir && !isTrash && emit('dragOverInto', $event, row.id ?? '')"
        @dragleave="emit('dragLeaveInto', $event)"
        @drop="row.isDir && emit('dropInto', $event, row.id ?? '')"
      >
        <label class="fm__card-check" @click.stop @dblclick.stop @pointerdown.stop>
          <input type="checkbox" :checked="selectedIds.includes(row.id ?? '')" @change="emit('toggleSelect', row.id ?? '')" />
        </label>
        <FileIcon
          :kind="kindOf(row)"
          :url="thumbUrl(row)"
          :name="row.name"
          size="lg"
          :thumb-failed="failedThumbs.includes(row.id ?? '')"
          @thumb-error="emit('thumbError', row.id)"
        />
        <span class="fm__card-name">{{ row.name }}</span>
        <span v-if="location(row)" class="fm__card-meta" :title="location(row)">{{ location(row) }}</span>
      </div>
    </div>

    <div v-if="isEmpty" class="fm__empty">
      <p class="fm__empty-title">{{ isTrash ? '回收站是空的' : '这里还没有文件' }}</p>
      <p class="fm__empty-hint">
        {{ isTrash ? '删除的文件会先放到这里' : '点右上角的「+」开始使用' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.fm__table {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
  /* 放在基础样式里而不是 @media 里：长按选中文字这件事不能依赖媒体查询是否命中
     （设备报告 hover: hover 时那一整块就都不生效了）。
     必须带 -webkit- 前缀 —— 老版 iOS Safari 只认前缀形式，不认无前缀的 user-select。
     表格里没有输入框，整块禁选是安全的 */
  -webkit-user-select: none;
  user-select: none;
}

.fm__thead,
.fm__row {
  display: grid;
  grid-template-columns: 28px 1fr 110px 220px;
  align-items: center;
  gap: 10px;
}

.fm__thead {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 0;
  background: #fff;
  border-bottom: 1px solid #e7e8ea;
}

/* 大图标视图下，表头退化成一条排序条 */
.fm__thead--grid {
  display: flex;
  justify-content: flex-start;
  gap: 20px;
}

.fm__th {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  font-size: 13px;
  color: #8b929c;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}

.fm__th:hover {
  color: #0052d9;
}

.fm__arrow {
  color: #0052d9;
}

.fm__check {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fm__check input {
  cursor: pointer;
}

.fm__row {
  padding: 9px 0;
  border-bottom: 1px solid #f2f3f5;
}

.fm__row:hover {
  background: #f8f9fb;
}

.fm__row--folder {
  cursor: pointer;
}

.fm__cell {
  min-width: 0;
  font-size: 13px;
  color: #6b7280;
  /* 双击打开时不要选中文字。前缀不能省，老版 iOS 只认 -webkit- 形式 */
  -webkit-user-select: none;
  user-select: none;
}

.fm__cell--name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fm__cell--time {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fm__namebox {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.fm__name {
  overflow: hidden;
  color: #1f2329;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 搜索时的所在路径、回收站里的原路径 */
.fm__row-sub {
  overflow: hidden;
  font-size: 12px;
  color: #a1a7b0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm__time {
  flex-shrink: 0;
}

/* ---------- 当前项（单击选中，只用于展示详情） ---------- */
.fm__row--focused {
  background: #eef0f3;
}

.fm__card--focused {
  background: #f5f6f8;
  border-color: #dcdcdc;
}

/* ---------- 拖拽移动 ---------- */
.fm__row--dragging,
.fm__card--dragging {
  opacity: 0.45;
}

.fm__row--drop {
  background: #e8f0fe;
  outline: 1px solid #0052d9;
  outline-offset: -1px;
}

.fm__card--drop {
  background: #e8f0fe;
  border-color: #0052d9;
}

.fm__loading {
  padding: 48px 0;
  font-size: 13px;
  color: #a1a7b0;
  text-align: center;
}

.fm__empty {
  padding: 72px 0;
  text-align: center;
}

.fm__empty-title {
  margin: 0 0 6px;
  font-size: 14px;
  color: #4b5563;
}

.fm__empty-hint {
  margin: 0;
  font-size: 13px;
  color: #a1a7b0;
}

/* ---------- 大图标视图 ---------- */
.fm__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 6px;
  padding-top: 12px;
}

.fm__card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 18px 8px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
}

.fm__card:hover {
  background: #f8f9fb;
  border-color: #eceef1;
}

.fm__card--folder {
  cursor: pointer;
}

.fm__card-check {
  position: absolute;
  top: 8px;
  left: 8px;
}

.fm__card-check input {
  cursor: pointer;
}

.fm__card-name {
  width: 100%;
  overflow: hidden;
  font-size: 13px;
  color: #1f2329;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 卡片很窄，长路径必须截断成一行，完整内容在底部详情里看 */
.fm__card-meta {
  width: 100%;
  overflow: hidden;
  font-size: 12px;
  color: #a1a7b0;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 触摸设备（TOUCH_QUERY = hover: none） ---------- */
@media (hover: none) {
  /* 禁选已经在基础样式里了，这里只处理触摸专有的行为 */
  .fm__table {
    -webkit-touch-callout: none;
    /* 禁掉双击缩放（我们不用 dblclick 了），但保留惯性滚动。
       不能用 touch-action: none —— 那会把滚动一起禁掉 */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  /* 按下时给个反馈，否则触摸屏上点了没任何回响 */
  .fm__row:active,
  .fm__card:active {
    background: #eef0f3;
  }

  /* 多选模式下才露出的勾选框，触摸端点起来只有 16px，
     撑到 32px 的命中区：网格里用负 margin 抵消，卡片上是绝对定位，改 top/left 保持视觉位置 */
  .fm__table--multi .fm__check {
    padding: 8px;
    margin: -8px;
  }

  .fm__table--multi .fm__card-check {
    top: 0;
    left: 0;
    padding: 8px;
  }
}

/* ---------- 多选模式 ----------
   默认不显示勾选框，那一列也一起收掉，列表更干净。
   进入方式只有一个：右键菜单里的「多选」（会顺带选中那一项）。
   所以「有没有选中项」就是模式的开关 —— 清空选择（底部操作条的「取消选择」、
   或切换目录触发的重新加载）就自动回到默认态。 */
.fm__table:not(.fm__table--multi) .fm__check,
.fm__table:not(.fm__table--multi) .fm__card-check {
  display: none;
}

.fm__table:not(.fm__table--multi) .fm__thead,
.fm__table:not(.fm__table--multi) .fm__row {
  grid-template-columns: 1fr 110px 220px;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .fm__table {
    padding: 0 12px 16px;
  }

  .fm__grid {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  }
}
</style>
