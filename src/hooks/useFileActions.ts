import { ref } from 'vue';
import type { Ref } from 'vue';

import { createEmptyFile } from '@/api/backup';
import {
  apiBackupDelete,
  apiBackupDescription,
  apiBackupFolderCreate,
  apiBackupMove,
  apiBackupRecycleList,
  apiBackupRecyclePurge,
  apiBackupRecycleRestore,
  apiBackupRename,
} from '@/api/backup';
import type { Backup } from '@/api/backup';
import { PURGE_CHUNK, RECYCLE_PAGE_SIZE } from '@/constants/file';
import { ensureExtension, isTextFile } from '@/utils/file';
import { message } from '@/utils/message';

export interface ConfirmState {
  title: string;
  text: string;
  danger: boolean;
  run: () => Promise<void>;
}

export function useFileActions(o: {
  parentId: Ref<string>;
  selectedIds: Ref<string[]>;
  reload: () => Promise<void>;
}) {
  const creating = ref(false);
  const newFolderName = ref('');
  const creatingFile = ref(false);
  const newFileName = ref('');
  const renameTarget = ref<Backup | null>(null);
  const renameValue = ref('');
  const describeTarget = ref<Backup | null>(null);
  const describeValue = ref('');
  const moveOpen = ref(false);
  const confirmState = ref<ConfirmState | null>(null);
  const dialogBusy = ref(false);

  function startCreateFolder() {
    creating.value = true;
    newFolderName.value = '';
  }

  function cancelCreateFolder() {
    creating.value = false;
    newFolderName.value = '';
  }

  async function confirmCreateFolder() {
    const name = newFolderName.value.trim();
    if (!name) {
      cancelCreateFolder();
      return;
    }

    dialogBusy.value = true;
    try {
      await apiBackupFolderCreate({ parentId: o.parentId.value || undefined, name });
      cancelCreateFolder();
      await o.reload();
    } catch {
      // 失败提示由请求层统一处理
    } finally {
      dialogBusy.value = false;
    }
  }

  function startCreateFile() {
    creatingFile.value = true;
    newFileName.value = '';
  }

  function cancelCreateFile() {
    creatingFile.value = false;
    newFileName.value = '';
  }

  /**
   * 新建空文本文件。复用上传接口，所以重名会自动加序号而不是报错
   * （和「新建文件夹」的语义不同 —— 上传路径里重名本来就是自动改名）。
   * 不写扩展名时按 .txt 补全。
   * 成功时返回新记录，交给页面决定要不要直接打开编辑器。
   */
  async function confirmCreateFile(): Promise<Backup | null> {
    // 末尾的点先去掉，否则「笔记.」会被补成「笔记..txt」
    const name = newFileName.value.trim().replace(/\.+$/, '');

    // 名字不合法时保持弹窗打开方便改，不像文件夹那样直接关掉
    if (!name) return null;

    const fileName = ensureExtension(name);

    if (!isTextFile(fileName)) {
      message.error('只支持新建文本类文件（.md / .txt / .json 等）');
      return null;
    }

    dialogBusy.value = true;
    try {
      const res = await createEmptyFile(fileName, o.parentId.value || undefined);
      const created = res.successList?.[0];

      if (!created) {
        message.error(res.failList?.[0]?.reason ?? '新建文件失败');
        return null;
      }

      cancelCreateFile();
      await o.reload();
      return created;
    } catch {
      // 失败提示由请求层统一处理
      return null;
    } finally {
      dialogBusy.value = false;
    }
  }

  function startRename(item: Backup) {
    renameTarget.value = item;
    renameValue.value = item.name ?? '';
  }

  function cancelRename() {
    renameTarget.value = null;
  }

  async function confirmRename() {
    const target = renameTarget.value;
    // 末尾的点先去掉，否则「风景.」会被补成「风景..png」
    const name = renameValue.value.trim().replace(/\.+$/, '');
    if (!target?.id || !name) return;

    // 文件夹不补扩展名 —— 名字里的点只是名字的一部分
    const newName = target.isDir ? name : ensureExtension(name, target.name);

    dialogBusy.value = true;
    try {
      await apiBackupRename({ id: target.id, name: newName });
      cancelRename();
      await o.reload();
    } catch {
      // 失败提示由请求层统一处理
    } finally {
      dialogBusy.value = false;
    }
  }

  function startDescribe(item: Backup) {
    describeTarget.value = item;
    describeValue.value = item.description ?? '';
  }

  function cancelDescribe() {
    describeTarget.value = null;
    describeValue.value = '';
  }

  /**
   * 存描述。刻意不调 reload()：load() 会清掉 selectedIds 和 focusedId
   * （底部详情条会当场消失），还要把整个目录重拉一遍。
   * items 是深层响应式的，就地改这一个字段，列表的悬浮提示和详情条都会跟着更新。
   */
  async function confirmDescribe() {
    const target = describeTarget.value;
    if (!target?.id) return;

    dialogBusy.value = true;
    try {
      const res = await apiBackupDescription({ id: target.id, description: describeValue.value.trim() });

      // 只回填 description。Jackson 没配 default-property-inclusion，null 是会序列化出来的，
      // 整个 Object.assign 会把 thumbnailUrl / parentPath 一起覆成 null ——
      // 前者让网格视图的缩略图退回原图，后者让搜索结果的「所在目录」副标题整行消失
      target.description = res.description ?? '';
      cancelDescribe();
    } catch {
      // 失败提示由请求层统一处理
    } finally {
      dialogBusy.value = false;
    }
  }

  function openMove() {
    moveOpen.value = true;
  }

  function closeMove() {
    moveOpen.value = false;
  }

  async function confirmMove(targetParentId: string) {
    const ids = o.selectedIds.value;
    if (!ids.length) return;

    try {
      await apiBackupMove({ ids, targetParentId: targetParentId || undefined });
      closeMove();
      await o.reload();
    } catch {
      // 失败提示由请求层统一处理
    }
  }

  function askConfirm(title: string, text: string, run: () => Promise<void>, danger = false) {
    confirmState.value = { title, text, danger, run };
  }

  function cancelConfirm() {
    confirmState.value = null;
  }

  async function runConfirm() {
    const state = confirmState.value;
    if (!state) return;

    dialogBusy.value = true;
    try {
      await state.run();
    } catch {
      // 失败提示由请求层统一处理
    } finally {
      dialogBusy.value = false;
      cancelConfirm();
    }
  }

  function idsOf(list: Backup[]) {
    return list.map((i) => i.id).filter((x): x is string => !!x);
  }

  function askDelete(list: Backup[]) {
    const ids = idsOf(list);
    if (!ids.length) return;

    askConfirm('移入回收站', `确定把选中的 ${ids.length} 项移入回收站吗？文件夹会连同子内容一起移入。`, async () => {
      await apiBackupDelete({ ids });
      await o.reload();
    });
  }

  function askPurge(list: Backup[]) {
    const ids = idsOf(list);
    if (!ids.length) return;

    askConfirm(
      '彻底删除',
      `将删除 OSS 对象并清除数据库记录，${ids.length} 项均不可恢复。确定继续吗？`,
      async () => {
        await apiBackupRecyclePurge({ ids });
        await o.reload();
      },
      true,
    );
  }

  async function restore(list: Backup[]) {
    const ids = idsOf(list);
    if (!ids.length) return;

    try {
      await apiBackupRecycleRestore({ ids });
      await o.reload();
    } catch {
      // 失败提示由请求层统一处理
    }
  }

  /** 回收站列表是分页的，清空要先翻完每一页拿到全部根节点 id */
  async function allRecycleIds() {
    const ids: string[] = [];
    let pageNum = 1;
    let total = Number.POSITIVE_INFINITY;

    while (ids.length < total) {
      const page = await apiBackupRecycleList({ pageNum, pageSize: RECYCLE_PAGE_SIZE });
      const records = page.items ?? [];
      total = page.total ?? records.length;

      for (const node of records) {
        if (node.id) ids.push(node.id);
      }
      // 防御：total 和数据不一致时不至于死循环
      if (records.length < RECYCLE_PAGE_SIZE) break;
      pageNum += 1;
    }

    return ids;
  }

  /**
   * 清空回收站。count 是列表已知的根节点数，用来在确认框里报数字。
   * 分片提交是因为 purge 逐个删 OSS 对象、会超过请求层 15 秒的超时；
   * purge 本身可重入，中断后剩下的下次再清即可。
   */
  function emptyRecycle(count: number) {
    if (!count) {
      message.info('回收站已经是空的');
      return;
    }

    askConfirm(
      '清空回收站',
      `将删除 OSS 对象并清除数据库记录，${count} 项及其全部子内容均不可恢复。确定继续吗？`,
      async () => {
        const ids = await allRecycleIds();
        for (let i = 0; i < ids.length; i += PURGE_CHUNK) {
          await apiBackupRecyclePurge({ ids: ids.slice(i, i + PURGE_CHUNK) });
        }
        await o.reload();
      },
      true,
    );
  }

  return {
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
    askConfirm,
    runConfirm,
    askDelete,
    askPurge,
    restore,
    emptyRecycle,
  };
}
