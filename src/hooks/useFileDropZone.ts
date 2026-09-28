import { computed, ref } from 'vue';
import type { ComputedRef } from 'vue';

import { isFileDrag } from '@/utils/drag';
import { droppedEntries, entriesToTree } from '@/utils/fs-entry';
import type { UploadTree } from '@/utils/fs-entry';

/** 操作系统文件拖入页面：拖拽上传的运行态 */
export function useFileDropZone(o: {
  isTrash: ComputedRef<boolean>;
  uploadFiles: (files: File[]) => Promise<void>;
  uploadTree: (tree: UploadTree) => Promise<void>;
}) {
  // 拖拽上传：子元素也会触发 enter/leave，用计数器判断是否真的离开了整个区域
  const dragDepth = ref(0);
  const dragging = computed(() => dragDepth.value > 0 && !o.isTrash.value);

  function onDragEnter(e: DragEvent) {
    if (o.isTrash.value || !isFileDrag(e)) return;
    dragDepth.value += 1;
  }

  function onDragOver(e: DragEvent) {
    if (o.isTrash.value || !isFileDrag(e)) return;
    // 不阻止默认行为就不会触发 drop
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(e: DragEvent) {
    if (o.isTrash.value || !isFileDrag(e)) return;
    dragDepth.value = Math.max(0, dragDepth.value - 1);
  }

  async function onDrop(e: DragEvent) {
    if (o.isTrash.value) return;
    e.preventDefault();
    dragDepth.value = 0;

    const entries = droppedEntries(e);
    if (entries.some((entry) => entry.isDirectory)) {
      await o.uploadTree(await entriesToTree(entries));
      return;
    }

    await o.uploadFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  return { dragDepth, dragging, onDragEnter, onDragOver, onDragLeave, onDrop };
}
