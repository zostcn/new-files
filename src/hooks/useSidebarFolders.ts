import { onMounted, ref } from 'vue';

import { apiBackupSidebarList, apiBackupSidebarSet, apiBackupSidebarSort } from '@/api/backup';
import type { Backup } from '@/api/backup';

/**
 * 侧边栏里钉住的文件夹。
 *
 * `folders` 是「某个文件有没有被钉住」的唯一真相，不要去读某一行的 `sidebarShow`：
 * 取消收藏时不会重拉文件列表，那一行的这个字段会一直停在旧值，菜单文案就会错。
 */
export function useSidebarFolders() {
  const folders = ref<Backup[]>([]);

  async function loadFolders() {
    try {
      folders.value = (await apiBackupSidebarList()) ?? [];
    } catch {
      // 失败提示由请求层统一处理，保留上一次的顺序
    }
  }

  function indexOf(item: Backup) {
    return folders.value.findIndex((f) => f.id === item.id);
  }

  /** 能不能朝这个方向挪一格。菜单据此决定要不要渲染「上移」「下移」 */
  function canMove(item: Backup, delta: number) {
    const i = indexOf(item);
    if (i === -1) return false;

    const target = i + delta;
    return target >= 0 && target < folders.value.length;
  }

  async function setPinned(item: Backup, pinned: boolean) {
    if (!item.id) return;

    try {
      await apiBackupSidebarSet({ id: item.id, sidebarShow: pinned });
      await loadFolders();
    } catch {
      // 失败提示由请求层统一处理
    }
  }

  /**
   * 交换相邻两项，把**完整**顺序交给后端重编号。
   * 接口要求传全量、不接受增量：本地交换后直接整个发过去，上移和以后可能的拖拽都是同一套。
   */
  async function move(item: Backup, delta: number) {
    const i = indexOf(item);
    if (!canMove(item, delta)) return;

    const next = [...folders.value];
    const target = i + delta;
    // 模板 tsconfig 开了 noUncheckedIndexedAccess,交换前要先落成具名变量
    const from = next[i];
    const to = next[target];
    if (from === undefined || to === undefined) return;
    next[i] = to;
    next[target] = from;

    const ids = next.map((f) => f.id).filter((id): id is string => !!id);

    try {
      await apiBackupSidebarSort({ ids });
      await loadFolders();
    } catch {
      // 失败提示由请求层统一处理
    }
  }

  onMounted(loadFolders);

  return { folders, loadFolders, setPinned, canMove, move };
}
