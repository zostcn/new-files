import { computed, ref } from 'vue';
import type { Ref } from 'vue';

import { uploadBatch, uploadFolder } from '@/api/backup';
import type { Failure } from '@/api/backup';
import { CHUNK_SIZE_LIMIT, DIRECT_UPLOAD_THRESHOLD, MAX_CHUNK_FILES } from '@/constants/file';
import type { UploadTree } from '@/utils/fs-entry';
import { message } from '@/utils/message';

import { useDirectUpload } from './useDirectUpload';

/**
 * 分片按累计大小和文件数切；单文件超 50MB 或单请求超 200MB 都会让**整个请求**失败，
 * 失败原因无法归属到具体文件，所以超限文件必须提前在前端拦掉。
 *
 * 注意这里只管**中转**那一部分：超过 DIRECT_UPLOAD_THRESHOLD 的文件走直传，绕开这些闸门。
 */
function chunkIndexes<T>(rows: T[], sizeOf: (row: T) => number) {
  const chunks: number[][] = [];
  let current: number[] = [];
  let acc = 0;

  rows.forEach((row, i) => {
    const size = sizeOf(row);
    if (current.length && (acc + size > CHUNK_SIZE_LIMIT || current.length >= MAX_CHUNK_FILES)) {
      chunks.push(current);
      current = [];
      acc = 0;
    }
    current.push(i);
    acc += size;
  });

  if (current.length) chunks.push(current);
  return chunks;
}

function describe(names: string[]) {
  const shown = names.slice(0, 3).join('、');
  return names.length > 3 ? `${shown} 等` : shown;
}

export function useUpload(o: { parentId: Ref<string>; reload: () => Promise<void> }) {
  /**
   * 正在跑的阶段数，而不是布尔量。拖拽上传这条入口没有"上传中"守卫
   * （工具栏按钮靠 disabled，拖拽没有可禁用的东西），两批并发时共享一个布尔量
   * 会让先结束的那条把按钮提前解开、而另一条还在传。
   */
  const flows = ref(0);
  const uploading = computed(() => flows.value > 0);

  const {
    uploadDirect,
    items: directItems,
    active: directActive,
    cancel: cancelDirect,
    reset: resetDirect,
  } = useDirectUpload();

  function report(ok: number, fails: Failure[]) {
    if (ok) message.success(`已上传 ${ok} 个文件`);

    if (fails.length) {
      const names = describe(fails.map((f) => f.name ?? '未知'));
      // 带上第一条失败原因：大部分批量失败是同因的（超限、类型不允许、授权过期），
      // 只报"N 个文件失败"会让用户完全无从下手
      const reason = fails.find((f) => f.reason)?.reason;
      message.error(`${fails.length} 个文件上传失败：${names}${reason ? `（${reason}）` : ''}`);
    }
  }

  /**
   * 按大小分流：**大于** DIRECT_UPLOAD_THRESHOLD 的走浏览器直传 OSS，
   * 其余走 nginx + Spring 的中转链路。
   *
   * 这里**不再**用 MAX_FILE_SIZE 提前拦大文件——那道上限只管中转路径。
   * 直传的硬上限是 DIRECT_UPLOAD_MAX，由上传器按项报错。
   */
  function splitBySize<T extends { file: File }>(rows: T[]) {
    const direct: T[] = [];
    const sendable: T[] = [];
    for (const row of rows) {
      (row.file.size > DIRECT_UPLOAD_THRESHOLD ? direct : sendable).push(row);
    }
    return { direct, sendable };
  }

  async function uploadFiles(files: File[], targetParentId?: string) {
    if (!files.length) return;

    const pid = targetParentId ?? o.parentId.value;
    const { direct, sendable } = splitBySize(files.map((f) => ({ file: f, path: f.name })));
    // 面板重新从这一批开始，不把上一次的结果留在屏幕上
    resetDirect();

    let ok = 0;
    const fails: Failure[] = [];

    if (sendable.length) {
      flows.value += 1;
      try {
        for (const indexes of chunkIndexes(sendable, (e) => e.file.size)) {
          const res = await uploadBatch(
            indexes.flatMap((i) => (sendable[i] ? [sendable[i].file] : [])),
            pid,
          );
          ok += res.successList?.length ?? 0;
          fails.push(...(res.failList ?? []));
        }
      } catch {
        // 传输层失败由请求层统一提示
      } finally {
        flows.value -= 1;
      }
    }

    if (direct.length) {
      flows.value += 1;
      try {
        const res = await uploadDirect(direct, pid);
        ok += res.ok;
        fails.push(...res.fails);
      } catch {
        // 传输层失败由请求层统一提示
      } finally {
        flows.value -= 1;
      }
    }

    if (sendable.length || direct.length) await o.reload();

    report(ok, fails);
  }

  async function uploadTree(tree: UploadTree, targetParentId?: string) {
    if (!tree.files.length && !tree.emptyDirs.length) return;

    const pid = targetParentId ?? o.parentId.value;
    const { direct, sendable } = splitBySize(tree.files);
    resetDirect();

    let ok = 0;
    const fails: Failure[] = [];

    // 中转这一路即使没有小文件也要发：空目录只能靠它建出来（直传没有可上传的字节）
    if (sendable.length || tree.emptyDirs.length) {
      const chunks = chunkIndexes(sendable, (e) => e.file.size);
      // 只有空目录时也要发一次，否则目录建不出来
      if (!chunks.length) chunks.push([]);

      flows.value += 1;
      try {
        for (const indexes of chunks) {
          // 每片都重发全部空目录：后端同名文件夹会合并，重复传是幂等的，
          // 这样无论怎么分片父目录都保证存在
          const res = await uploadFolder(
            indexes.flatMap((i) => (sendable[i] ? [sendable[i].file] : [])),
            indexes.flatMap((i) => (sendable[i] ? [sendable[i].path] : [])),
            tree.emptyDirs,
            pid,
          );
          ok += res.successList?.length ?? 0;
          fails.push(...(res.failList ?? []));
        }
      } catch {
        // 传输层失败由请求层统一提示
      } finally {
        flows.value -= 1;
      }
    }

    if (direct.length) {
      flows.value += 1;
      try {
        // path 是相对路径，与 uploadFolder 的 paths[] 同语义，后端据此建出中间目录
        const res = await uploadDirect(direct, pid);
        ok += res.ok;
        fails.push(...res.fails);
      } catch {
        // 传输层失败由请求层统一提示
      } finally {
        flows.value -= 1;
      }
    }

    if (sendable.length || tree.emptyDirs.length || direct.length) await o.reload();

    report(ok, fails);
  }

  return {
    uploadFiles,
    uploadTree,
    uploading,
    /** 直传逐项进度，供上传面板渲染 */
    directItems,
    /** 是否正处于直传阶段（面板据此显示「取消」还是「关闭」） */
    directActive,
    cancelDirect,
    resetDirect,
  };
}
