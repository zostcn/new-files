import { onMounted, ref } from 'vue';

import { apiBackupFolderStats } from '@/api/backup';

export interface FolderStats {
  totalSize: number;
  fileCount: number;
  folderCount: number;
}

const EMPTY: FolderStats = { totalSize: 0, fileCount: 0, folderCount: 0 };

/**
 * 全站用量统计。注意后端统计的是活跃文件，**不含回收站** ——
 * 回收站里的对象在被彻底删除前仍然占着 OSS 空间。
 */
export function useFolderStats() {
  const stats = ref<FolderStats>({ ...EMPTY });

  async function loadStats() {
    try {
      // id = 0 表示全站；三个字段都是字符串
      const vo = await apiBackupFolderStats({ id: '0' });
      stats.value = {
        totalSize: Number(vo.totalSize) || 0,
        fileCount: Number(vo.fileCount) || 0,
        folderCount: Number(vo.folderCount) || 0,
      };
    } catch {
      // 失败提示由请求层统一处理，保留上一次的数值
    }
  }

  onMounted(loadStats);

  return { stats, loadStats };
}
