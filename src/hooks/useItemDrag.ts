import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

import { apiBackupDelete, apiBackupMove } from '@/api/backup';
import type { Backup } from '@/api/backup';
import { isFileDrag } from '@/utils/drag';
import { droppedEntries, entriesToTree } from '@/utils/fs-entry';
import type { UploadTree } from '@/utils/fs-entry';

/** 条目之间的拖拽：拖到文件夹=移动，拖到侧边栏回收站=删除 */
export function useItemDrag(o: {
  isTrash: ComputedRef<boolean>;
  parentId: Ref<string>;
  selectedIds: Ref<string[]>;
  reload: () => Promise<void>;
  uploadFiles: (files: File[], targetParentId?: string) => Promise<void>;
  uploadTree: (tree: UploadTree, targetParentId?: string) => Promise<void>;
}) {
  const dragIds = ref<string[]>([]);
  const dragOverTarget = ref<string | null>(null);
  const dragOverTrash = ref(false);

  /** 是否正在拖动条目 —— 决定回收站落点要不要出现 */
  const dragActive = computed(() => dragIds.value.length > 0);

  function canDropInto(targetId: string) {
    const ids = dragIds.value;
    if (!ids.length) return false;
    // 已经在这个目录里，或想移进自身
    if (targetId === o.parentId.value) return false;
    if (targetId && ids.includes(targetId)) return false;

    return true;
  }

  function onItemDragStart(e: DragEvent, item: Backup) {
    const id = item.id ?? '';
    if (!id) return;

    // 拖的是已勾选项就整批拖走，否则只拖这一项
    dragIds.value = o.selectedIds.value.includes(id) ? [...o.selectedIds.value] : [id];

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // 内部拖拽只带 text/plain，不会命中上传逻辑的 Files 判断
      e.dataTransfer.setData('text/plain', dragIds.value.join(','));
    }
  }

  function onItemDragEnd() {
    dragIds.value = [];
    dragOverTarget.value = null;
    dragOverTrash.value = false;
  }

  function dragOverInto(e: DragEvent, targetId: string) {
    // 系统文件拖入时，文件夹也是合法落点
    if (isFileDrag(e)) {
      e.preventDefault();
      return;
    }

    if (!canDropInto(targetId)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverTarget.value = targetId;
  }

  function dragLeaveInto(e: DragEvent) {
    // 在子元素之间移动也会触发 dragleave，只有真的离开才取消高亮
    const el = e.currentTarget as HTMLElement | null;
    const to = e.relatedTarget as Node | null;
    if (el && to && el.contains(to)) return;

    dragOverTarget.value = null;
  }

  async function dropInto(e: DragEvent, targetId: string) {
    const files = Array.from(e.dataTransfer?.files ?? []);
    const entries = droppedEntries(e);

    if (files.length || entries.length) {
      e.preventDefault();
      e.stopPropagation();

      if (entries.some((entry) => entry.isDirectory)) {
        await o.uploadTree(await entriesToTree(entries), targetId);
      } else {
        await o.uploadFiles(files, targetId);
      }
      return;
    }

    if (!dragIds.value.length) return;
    e.preventDefault();
    e.stopPropagation();

    const ids = [...dragIds.value];
    const allowed = canDropInto(targetId);
    dragIds.value = [];
    dragOverTarget.value = null;
    if (!allowed) return;

    try {
      await apiBackupMove({ ids, targetParentId: targetId || undefined });
      await o.reload();
    } catch {
      // 失败提示由请求层统一处理
    }
  }

  function trashDragOver(e: DragEvent) {
    if (o.isTrash.value || !dragIds.value.length) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverTrash.value = true;
  }

  function trashDragLeave(e: DragEvent) {
    const el = e.currentTarget as HTMLElement | null;
    const to = e.relatedTarget as Node | null;
    if (el && to && el.contains(to)) return;

    dragOverTrash.value = false;
  }

  async function trashDrop(e: DragEvent) {
    if (o.isTrash.value || !dragIds.value.length) return;
    e.preventDefault();

    const ids = [...dragIds.value];
    dragIds.value = [];
    dragOverTrash.value = false;

    try {
      await apiBackupDelete({ ids });
      await o.reload();
    } catch {
      // 失败提示由请求层统一处理
    }
  }

  return {
    dragIds,
    dragActive,
    dragOverTarget,
    dragOverTrash,
    canDropInto,
    onItemDragStart,
    onItemDragEnd,
    dragOverInto,
    dragLeaveInto,
    dropInto,
    trashDragOver,
    trashDragLeave,
    trashDrop,
  };
}
