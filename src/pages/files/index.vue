<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import type { Backup } from '@/api/backup';
import MoveDialog from '@/components/MoveDialog.vue';
import { NARROW_QUERY, TEXT_MAX_SIZE, TOUCH_QUERY } from '@/constants/file';
import type { NavKey, ViewMode } from '@/constants/file';
import { useFileActions } from '@/hooks/useFileActions';
import { useFileDropZone } from '@/hooks/useFileDropZone';
import { useFileList } from '@/hooks/useFileList';
import { useFileSelection } from '@/hooks/useFileSelection';
import { useFileTransfer } from '@/hooks/useFileTransfer';
import { useFolderStats } from '@/hooks/useFolderStats';
import { useItemDrag } from '@/hooks/useItemDrag';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSidebar } from '@/hooks/useSidebar';
import { useSidebarFolders } from '@/hooks/useSidebarFolders';
import { useTextFile } from '@/hooks/useTextFile';
import { useUpload } from '@/hooks/useUpload';
import { useViewMode } from '@/hooks/useViewMode';
import { useSystemStore } from '@/stores/system';
import { isTextFile, pathOf } from '@/utils/file';

import ConfirmDialog from './components/ConfirmDialog.vue';
import ContextMenu from './components/ContextMenu.vue';
import DescribeDialog from './components/DescribeDialog.vue';
import DropOverlay from './components/DropOverlay.vue';
import FileDetails from './components/FileDetails.vue';
import FileTable from './components/FileTable.vue';
import HomePager from './components/HomePager.vue';
import HomeSidebar from './components/HomeSidebar.vue';
import HomeToolbar from './components/HomeToolbar.vue';
import NameDialog from './components/NameDialog.vue';
import PreviewDialog from './components/PreviewDialog.vue';
import SelectionBar from './components/SelectionBar.vue';
import SidebarDrawer from './components/SidebarDrawer.vue';
import TextDialog from './components/TextDialog.vue';
import TrashDropZone from './components/TrashDropZone.vue';
import UploadPanel from './components/UploadPanel.vue';
import UserMenu from './components/UserMenu.vue';

const router = useRouter();
const route = useRoute();
// v2 的会话态在 system store(旧 stores/user 是 JWT 时代的,已随请求层一起弃用)
const userStore = useSystemStore();

const { selectedIds, selectedCount, toggleSelect, clearSelection } = useFileSelection();
const { viewMode, setViewMode } = useViewMode();
const { collapsed, toggleSidebar } = useSidebar();

const {
  navKey,
  parentId,
  pathNodes,
  total,
  pageNum,
  keyword,
  loading,
  sortKey,
  sortAsc,
  failedThumbs,
  isTrash,
  pageSize,
  totalPages,
  currentDirName,
  rows,
  allSelected,
  selectedItems,
  focusedRow,
  setFocused,
  clearFocused,
  markThumbFailed,
  load,
  setSort,
  selectAll,
  toggleSelectAll,
  openFolder,
  goToPath,
  selectNav,
  goPage,
} = useFileList({ selectedIds });

const { stats, loadStats } = useFolderStats();

const {
  folders: pinnedFolders,
  loadFolders,
  setPinned,
  canMove,
  move: movePinned,
} = useSidebarFolders();

// 列表、用量、侧边栏一起刷新：重命名/删除/移动一个被钉住的文件夹后，侧边栏也要跟着变
async function reload() {
  await Promise.all([load(), loadStats(), loadFolders()]);
}

const pinnedIds = computed(
  () => new Set(pinnedFolders.value.map((f) => f.id).filter((id): id is string => !!id)),
);

/**
 * 当前目录命中的那个钉住项，用于侧边栏高亮。
 * 按「后代也算」判定：进到被钉住的文件夹深处时它应该保持高亮，否则每往下钻一层高亮就没了。
 * 面包屑首项是合成的根节点，跳过它；搜索和回收站下面包屑为空，自然不高亮。
 */
const activePinId = computed(() => {
  const hit = pathNodes.value.slice(1).find((node) => node.id && pinnedIds.value.has(node.id));
  return hit?.id ?? '';
});

function isPinned(row: Backup) {
  return !!row.id && pinnedIds.value.has(row.id);
}

const { uploadFiles, uploadTree, uploading, directItems, directActive, cancelDirect, resetDirect } =
  useUpload({ parentId, reload });

// 上传期间拦住刷新/关标签页：直传没有断点续传，刷新等于整个文件重传
useLeaveGuard(uploading);

const {
  dragIds,
  dragActive,
  dragOverTarget,
  dragOverTrash,
  onItemDragStart,
  onItemDragEnd,
  dragOverInto,
  dragLeaveInto,
  dropInto,
  trashDragOver,
  trashDragLeave,
  trashDrop,
} = useItemDrag({ isTrash, parentId, selectedIds, reload, uploadFiles, uploadTree });

const {
  creating,
  newFolderName,
  creatingFile,
  newFileName,
  startCreateFile,
  cancelCreateFile,
  confirmCreateFile,
  renameTarget,
  renameValue,
  describeTarget,
  describeValue,
  moveOpen,
  confirmState,
  dialogBusy,
  startCreateFolder,
  cancelCreateFolder,
  confirmCreateFolder,
  startRename,
  cancelRename,
  confirmRename,
  startDescribe,
  cancelDescribe,
  confirmDescribe,
  openMove,
  closeMove,
  confirmMove,
  cancelConfirm,
  runConfirm,
  askConfirm,
  askDelete,
  askPurge,
  restore,
  emptyRecycle,
} = useFileActions({ parentId, selectedIds, reload });

const { dragging, onDragEnter, onDragOver, onDragLeave, onDrop } = useFileDropZone({
  isTrash,
  uploadFiles,
  uploadTree,
});

const { previewTarget, previewUrl, previewLoading, openPreview, closePreview, download, downloadPreview } =
  useFileTransfer();

const {
  target: textTarget,
  content: textContent,
  loading: textLoading,
  saving: textSaving,
  error: textError,
  isDirty: textIsDirty,
  open: openText,
  close: closeText,
  save: saveText,
  copy: copyText,
} = useTextFile({ reload });

/** 编辑器里的「下载」走和列表一样的预签名直链 */
function downloadText() {
  if (textTarget.value) download([textTarget.value]);
}

function updateTextContent(v: string) {
  textContent.value = v;
}

const isEmpty = computed(() => !loading.value && rows.value.length === 0 && !creating.value);

const toolbar = ref<InstanceType<typeof HomeToolbar>>();

/**
 * 有浮层挂着。快捷键要让位：Esc 归弹窗处理，Ctrl+A 也不该穿透到底下的列表。
 * （menu 声明在后面，这里是函数体内的延迟求值，不存在 TDZ —— 上面的路由 watch 同样如此）
 */
const overlayOpen = computed(
  () =>
    !!(
      previewTarget.value ||
      textTarget.value ||
      renameTarget.value ||
      describeTarget.value ||
      confirmState.value ||
      creating.value ||
      creatingFile.value ||
      moveOpen.value ||
      menu.value
    ),
);

/** 焦点在输入框里时，快捷键是输入框的，不该被列表抢走 */
function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;

  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable;
}

/**
 * 取「当前项」，供 F2 / Delete 这类单行快捷键使用。
 * 判定条件和详情条一致 —— 有勾选时不存在"当前项"，和右键菜单的禁用规则保持一致。
 * 返回 null 表示当下没有可操作的目标：在回收站里、有勾选、或者已经有浮层开着
 * （编辑器打开时 focusedRow 仍然置着，不拦就会往回叠一个新弹窗）。
 */
function currentRow(): Backup | null {
  if (isTrash.value || selectedCount.value > 0 || overlayOpen.value) return null;

  return focusedRow.value ?? null;
}

/**
 * Ctrl+F 站内搜索、Ctrl+A 全选；
 * F2 重命名当前项、Delete 删除当前项、Esc 取消全部勾选，和资源管理器一致。
 */
function onHotkey(e: KeyboardEvent) {
  // 只认 Delete。绝不带上 Backspace —— 它紧挨着回车，误触代价太大
  if (e.key === 'F2' || e.key === 'Delete') {
    const row = currentRow();
    if (!row) return;

    // 这两个键在浏览器里没有默认行为，拦下来只是免得被输入法或扩展接走
    e.preventDefault();
    if (e.key === 'F2') startRename(row);
    else askDelete([row]);
    return;
  }

  if (e.key === 'Escape') {
    // 弹窗/右键菜单自己会处理，不能被这里抢掉
    if (overlayOpen.value) return;
    if (selectedCount.value > 0) clearSelection();
    return;
  }

  if (!(e.ctrlKey || e.metaKey)) return;

  const key = e.key.toLowerCase();

  if (key === 'a') {
    if (isTypingTarget(e.target) || overlayOpen.value) return;

    // 回收站的分页是本地重排，也支持多选，所以两种模式都放行。
    // 无论列表空不空都要拦，否则浏览器会把整页文字选上
    e.preventDefault();
    if (!allSelected.value) selectAll();
    return;
  }

  if (key === 'f') {
    // 回收站里没有搜索框，这时不拦，让浏览器自带的查找正常工作
    if (toolbar.value?.focusSearch()) e.preventDefault();
  }
}

/**
 * 路由一变就关掉所有浮层。
 * 弹窗的遮罩能挡住页面上的点击，但挡不住浏览器的后退/前进和鼠标侧键 ——
 * 不关的话弹窗会盖在刚切过去的那个目录上，看着像卡住了。
 */
watch(
  () => route.fullPath,
  () => {
    closePreview();
    cancelRename();
    cancelDescribe();
    cancelCreateFolder();
    cancelConfirm();
    closeMove();
    menu.value = null;
    drawerOpen.value = false;
    // 刻意不关文本编辑器：里面可能有未保存的改动，自动关掉等于静默丢弃。
    // 它由自己的关闭流程兜底（见 onTextClose 的脏数据确认）。
  },
);

const isNarrow = useMediaQuery(NARROW_QUERY);
const isTouchCapable = useMediaQuery(TOUCH_QUERY);

// 窄屏强制卡片视图（表格最小 388px 装不下）。
// 刻意不调 setViewMode —— 那会把桌面端的偏好覆盖掉，窗口拉宽后就回不去了
const effectiveViewMode = computed<ViewMode>(() => (isNarrow.value ? 'grid' : viewMode.value));

// 抽屉是否展开。刻意不持久化 —— 存成 true 会导致每次打开都盖着内容
const drawerOpen = ref(false);

/**
 * 窄屏下汉堡按钮开关抽屉，宽屏仍是原来的折叠侧边栏。
 * 窄屏绝不碰 collapsed/localStorage：那个偏好属于桌面布局，
 * 用户存了"已折叠"，窄屏下也应该能正常拉出抽屉。
 */
function onToggleSidebar() {
  if (isNarrow.value) drawerOpen.value = !drawerOpen.value;
  else toggleSidebar();
}

function onSelectNav(key: NavKey) {
  selectNav(key);
  drawerOpen.value = false;
}

function onGoHome() {
  goToPath('');
  drawerOpen.value = false;
}

/** 点侧边栏里钉住的文件夹。窄屏下顺手收抽屉，和 onSelectNav / onGoHome 一致 */
function openPinned(id: string) {
  goToPath(id);
  drawerOpen.value = false;
}

// 变宽时关掉，否则遮罩会残留在桌面布局上
watch(isNarrow, (narrow) => {
  if (!narrow) drawerOpen.value = false;
});

// 触屏笔记本的空子：主指针是触控板时 TOUCH_QUERY 不成立，但用户会直接用手指戳屏幕。
// 一旦见过触摸指针就粘住整个会话 —— 重置会导致手势中途反复切换判定。
const sawTouch = ref(false);

function onPointerType(e: PointerEvent) {
  if (e.pointerType === 'touch') sawTouch.value = true;
}

const isTouch = computed(() => isTouchCapable.value || sawTouch.value);

onMounted(() => {
  window.addEventListener('keydown', onHotkey);
  window.addEventListener('pointerdown', onPointerType);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onHotkey);
  window.removeEventListener('pointerdown', onPointerType);
});

// 解构出来的 ref 无法在模板里直接赋值（编译器识别不到是 ref），统一走包装函数
function updateKeyword(v: string) {
  keyword.value = v;
}

function updateNewFolderName(v: string) {
  newFolderName.value = v;
}

function updateNewFileName(v: string) {
  newFileName.value = v;
}

function openCreateFileDialog() {
  clearFocused();
  startCreateFile();
}

/** 建完直接进编辑器，省得再为一个空文件双击一次 */
async function submitCreateFile() {
  const created = await confirmCreateFile();
  if (created) openText(created);
}

function updateRenameValue(v: string) {
  renameValue.value = v;
}

function updateDescribeValue(v: string) {
  describeValue.value = v;
}

// 双击：文件夹进目录；文本文件进编辑器；其余文件开预览
function onRowOpen(item: Backup) {
  if (!item.isDir && !isTrash.value) {
    if (isTextFile(item.name)) {
      // 超过上限的文本直接转下载：后端一定会拒绝，没必要先开一个必然失败的弹窗
      if (Number(item.size) > TEXT_MAX_SIZE) {
        download([item]);
        return;
      }

      openText(item);
      return;
    }

    openPreview(item);
    return;
  }

  openFolder(item);
}

/** 关编辑器：有未保存的改动先确认，避免误关丢内容 */
function onTextClose() {
  if (!textIsDirty.value) {
    closeText();
    return;
  }

  askConfirm('放弃修改？', '这个文件有未保存的改动，关闭后会丢失。', async () => {
    closeText();
  });
}

// 单击：只把该行设为当前项（详情显示在底部），不碰勾选
function onRowFocus(item: Backup) {
  setFocused(item.id ?? '');
}

function onCreateFolder() {
  // 否则详情条会和新文件夹那一行同时杵着
  clearFocused();
  startCreateFolder();
}

interface MenuEntry {
  key: string;
  label: string;
  danger?: boolean;
}

/** 侧边栏那份菜单要高过窄屏抽屉（SidebarDrawer 在窄屏是 z-index 60），否则菜单被抽屉整个盖住 */
const MENU_Z_ABOVE_DRAWER = 70;

const menu = ref<{
  row: Backup;
  x: number;
  y: number;
  items: MenuEntry[];
  /** 不传就用 ContextMenu 的默认层（50），只有从侧边栏唤起时才需要抬高 */
  zIndex?: number;
} | null>(null);

/** 菜单里恒有的一项：进入多选模式并选中这一项 */
const MULTI_ENTRY: MenuEntry = { key: 'multi', label: '多选' };

function buildMenu(row: Backup): MenuEntry[] {
  if (isTrash.value) {
    // 回收站里的节点是待处理的，描述和侧边栏都不该在这里出现
    return [{ key: 'restore', label: '恢复' }, MULTI_ENTRY, { key: 'purge', label: '彻底删除', danger: true }];
  }

  return [
    // 文件夹签不出直链
    ...(row.isDir ? [] : [{ key: 'download', label: '下载' }]),
    MULTI_ENTRY,
    { key: 'rename', label: '重命名' },
    { key: 'describe', label: '描述' },
    // 只有文件夹能收藏：侧边栏那一列是目录跳转入口，文件进去没有意义
    ...(row.isDir ? [{ key: 'toggle-sidebar', label: isPinned(row) ? '取消收藏' : '收藏' }] : []),
    { key: 'delete', label: '删除', danger: true },
  ];
}

/** 侧边栏里的菜单。上移下移只在真能挪的时候才出现，不做灰态 —— MenuEntry 没有 disabled 这个概念 */
function buildSidebarMenu(folder: Backup): MenuEntry[] {
  return [
    ...(canMove(folder, -1) ? [{ key: 'sidebar-up', label: '上移' }] : []),
    ...(canMove(folder, 1) ? [{ key: 'sidebar-down', label: '下移' }] : []),
    { key: 'toggle-sidebar', label: '取消收藏' },
  ];
}

/** 右键 / 长按。坐标由 FileTable 算好传进来（长按是异步触发的，那里才算得到位置） */
function onContextMenu(row: Backup, x: number, y: number) {
  // 勾选状态下禁用：菜单只作用于单行，和「已选 N 项」的批量语义会打架，
  // 批量操作统一走底部操作条。连当前项也不动，避免"右键有反应但没菜单"
  if (selectedCount.value > 0) return;

  setFocused(row.id ?? '');
  menu.value = { row, x, y, items: buildMenu(row) };
}

/**
 * 侧边栏里右键 / 长按。和列表共用同一个 menu ref —— 这样天然只有一个菜单能开着，
 * 也省掉一个 ContextMenu 实例。坐标同样是视口坐标，不用换算。
 */
function onSidebarContextMenu(folder: Backup, x: number, y: number) {
  menu.value = {
    row: folder,
    x,
    y,
    items: buildSidebarMenu(folder),
    zIndex: MENU_Z_ABOVE_DRAWER,
  };
}

function onMenuSelect(key: string) {
  const target = menu.value?.row;
  menu.value = null;
  if (!target) return;

  switch (key) {
    case 'multi':
      // 选中当前项即进入多选模式，勾选框随之出现。
      // 菜单在有选中项时是禁用的（见 onContextMenu），所以这里只会是"选中"、不会误取消
      toggleSelect(target.id ?? '');
      break;
    case 'download':
      download([target]);
      break;
    case 'rename':
      startRename(target);
      break;
    case 'describe':
      startDescribe(target);
      break;
    case 'toggle-sidebar':
      // 侧边栏那份菜单只有「取消收藏」，这里按当前状态取反即可
      setPinned(target, !isPinned(target));
      break;
    case 'sidebar-up':
      movePinned(target, -1);
      break;
    case 'sidebar-down':
      movePinned(target, 1);
      break;
    case 'delete':
      askDelete([target]);
      break;
    case 'restore':
      restore([target]);
      break;
    case 'purge':
      askPurge([target]);
      break;
  }
}

const onLogout = async () => {
  await userStore.logout();
  router.push('/login');
};

function askLogout() {
  askConfirm('退出登录', '确定要退出登录吗？', onLogout);
}
</script>

<template>
  <div class="fm">
    <SidebarDrawer :open="drawerOpen" :narrow="isNarrow" @close="drawerOpen = false">
      <!-- 窄屏下侧边栏总是渲染，由抽屉控制显隐；宽屏才看 collapsed -->
      <HomeSidebar
        v-if="isNarrow || !collapsed"
        :nav-key="navKey"
        :stats="stats"
        :folders="pinnedFolders"
        :active-pin-id="activePinId"
        :touch="isTouch"
        @select="onSelectNav"
        @home="onGoHome"
        @open="openPinned"
        @context-menu="onSidebarContextMenu"
      />
    </SidebarDrawer>

    <section
      class="fm__main"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <DropOverlay v-if="dragging" :dir-name="currentDirName" />

      <HomeToolbar
        ref="toolbar"
        :is-trash="isTrash"
        :keyword="keyword"
        :view-mode="viewMode"
        :path-nodes="pathNodes"
        :drag-over-target="dragOverTarget"
        :uploading="uploading"
        :trash-count="total"
        :collapsed="collapsed"
        :narrow="isNarrow"
        :drawer-open="drawerOpen"
        @toggle-sidebar="onToggleSidebar"
        @update:keyword="updateKeyword"
        @update:view-mode="setViewMode"
        @files="uploadFiles"
        @files-tree="uploadTree"
        @create-folder="onCreateFolder"
        @create-file="openCreateFileDialog"
        @empty-recycle="emptyRecycle(total)"
        @go-to-path="goToPath"
        @drag-over-into="dragOverInto"
        @drag-leave-into="dragLeaveInto"
        @drop-into="dropInto"
      >
        <template #account>
          <!-- v2 用户表无头像字段,avatar 传空让 UserMenu 回落到默认图标 -->
          <UserMenu
            :avatar="''"
            @recycle="onSelectNav('trash')"
            @logout="askLogout"
          />
        </template>
      </HomeToolbar>

      <div class="fm__files">
        <FileTable
          :rows="rows"
          :loading="loading"
          :is-empty="isEmpty"
          :view-mode="effectiveViewMode"
          :is-trash="isTrash"
          :touch="isTouch"
          :multi-select="selectedCount > 0"
          :keyword="keyword"
          :sort-key="sortKey"
          :sort-asc="sortAsc"
          :all-selected="allSelected"
          :selected-ids="selectedIds"
          :focused-id="focusedRow?.id ?? ''"
          :drag-ids="dragIds"
          :drag-over-target="dragOverTarget"
          :failed-thumbs="failedThumbs"
          @sort="setSort"
          @toggle-select-all="toggleSelectAll"
          @toggle-select="toggleSelect"
          @focus="onRowFocus"
          @clear-focus="clearFocused"
          @open="onRowOpen"
          @context-menu="onContextMenu"
          @item-drag-start="onItemDragStart"
          @item-drag-end="onItemDragEnd"
          @drag-over-into="dragOverInto"
          @drag-leave-into="dragLeaveInto"
          @drop-into="dropInto"
          @thumb-error="markThumbFailed"
        />
      </div>

      <!--
        分页器刻意排在下面那三条之上：底部最靠下的一条必须是详情/操作区，
        它才能和侧边栏的存储空间齐平（两者都是 --fm-bottombar-h 高、都贴着底边）。
      -->
      <HomePager
        v-if="total > pageSize"
        :page-num="pageNum"
        :total-pages="totalPages"
        :total="total"
        @change="goPage"
      />

      <SelectionBar
        v-if="selectedCount && !dragActive"
        :count="selectedCount"
        :is-trash="isTrash"
        @move="openMove"
        @delete="askDelete(selectedItems)"
        @restore="restore(selectedItems)"
        @purge="askPurge(selectedItems)"
        @download="download(selectedItems)"
        @clear="clearSelection"
      />

      <!-- 和多选操作条同一个位置、互斥：拖动中按钮本来也点不了 -->
      <TrashDropZone
        v-if="dragActive && !isTrash"
        :over="dragOverTrash"
        @drag-over="trashDragOver"
        @drag-leave="trashDragLeave"
        @drop="trashDrop"
      />

      <FileDetails
        v-if="!dragActive && !selectedCount && focusedRow"
        :item="focusedRow"
        :path="pathOf(focusedRow, { searching: !!keyword.trim(), isTrash })"
      />

      <!--
        直传进度面板。显隐直接看 directItems 是否为空——关掉它就是把列表清空，
        而每次上传开头都会调 resetDirect()，所以下一批会自然重新出现，
        不需要另外一个"用户关过没有"的状态。
        全部成功时由 useDirectUpload 在 2 秒后自动清空（失败/取消则不自动收）。
      -->
      <Transition name="fm__upload-fade">
        <UploadPanel
          v-if="directItems.length"
          :items="directItems"
          :active="directActive"
          @cancel="cancelDirect"
          @close="resetDirect"
        />
      </Transition>
    </section>

    <NameDialog
      v-if="renameTarget"
      title="重命名"
      placeholder="新名称"
      :model-value="renameValue"
      :loading="dialogBusy"
      @update:model-value="updateRenameValue"
      @confirm="confirmRename"
      @cancel="cancelRename"
    />

    <DescribeDialog
      v-if="describeTarget"
      :model-value="describeValue"
      :loading="dialogBusy"
      @update:model-value="updateDescribeValue"
      @confirm="confirmDescribe"
      @cancel="cancelDescribe"
    />

    <NameDialog
      v-if="creating"
      title="新建文件夹"
      placeholder="文件夹名称"
      :model-value="newFolderName"
      :loading="dialogBusy"
      @update:model-value="updateNewFolderName"
      @confirm="confirmCreateFolder"
      @cancel="cancelCreateFolder"
    />

    <NameDialog
      v-if="creatingFile"
      title="新建文件"
      placeholder="文件名（不写后缀默认 .txt，如 笔记.md）"
      :model-value="newFileName"
      :loading="dialogBusy"
      @update:model-value="updateNewFileName"
      @confirm="submitCreateFile"
      @cancel="cancelCreateFile"
    />

    <!-- 放在 ConfirmDialog 之前：脏数据确认要盖在编辑器上面（两者 z-index 相同，靠 DOM 顺序定层级） -->
    <TextDialog
      v-if="textTarget"
      :item="textTarget"
      :model-value="textContent"
      :loading="textLoading"
      :saving="textSaving"
      :error="textError"
      @update:model-value="updateTextContent"
      @save="saveText($event)"
      @copy="copyText()"
      @download="downloadText()"
      @close="onTextClose()"
    />

    <ConfirmDialog
      v-if="confirmState"
      :title="confirmState.title"
      :text="confirmState.text"
      :danger="confirmState.danger"
      :loading="dialogBusy"
      @confirm="runConfirm"
      @cancel="cancelConfirm"
    />

    <MoveDialog
      v-if="moveOpen"
      :exclude-ids="selectedIds"
      :moving-count="selectedCount"
      @confirm="confirmMove"
      @cancel="closeMove"
    />

    <PreviewDialog
      v-if="previewTarget"
      :item="previewTarget"
      :url="previewUrl"
      :loading="previewLoading"
      @download="downloadPreview"
      @close="closePreview"
    />

    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menu.items"
      :z-index="menu.zIndex"
      @select="onMenuSelect"
      @close="menu = null"
    />
  </div>
</template>

<style scoped>
.fm {
  display: flex;
  height: 100%;
  background: #fff;
}

.fm__main {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

/* 文件展示区：让 .fm__table 撑满剩余高度的 flex 容器 */
.fm__files {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* ---------- 上传面板的进出场 ----------
   这几个类挂在 <Transition> 的子节点上，也就是 UploadPanel 的根元素。
   写在 index.vue 的 scoped 里是有效的：子组件的根元素同时带父组件的 scope id，
   所以父组件能改它的根，改不到它内部。 */
.fm__upload-fade-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.fm__upload-fade-leave-active {
  /* 退场比进场快：收起是"我已经看完了"，拖久了显得拖沓 */
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

/* 从下方 8px 处升上来。面板本就贴在右下角，往上浮一点比原地淡入更有"冒出来"的意思 */
.fm__upload-fade-enter-from,
.fm__upload-fade-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
