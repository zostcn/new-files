/**
 * 判断拖拽的是不是操作系统文件。
 * 内部拖拽只设置 text/plain，不设置 Files，靠这个区分两种拖拽。
 */
export function isFileDrag(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}
