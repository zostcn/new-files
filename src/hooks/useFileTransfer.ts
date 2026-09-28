import { ref } from 'vue';

import { apiBackupDownload, apiBackupDownloadBatch } from '@/api/backup';
import type { Backup, Failure } from '@/api/backup';
import { DOWNLOAD_BATCH_MAX, DOWNLOAD_INTERVAL, PREVIEW_KINDS } from '@/constants/file';
import { kindOf } from '@/utils/file';
import { message } from '@/utils/message';

/** 下载与预览：都走后端签发的带原文件名的预签名直链，不占服务器带宽 */
export function useFileTransfer() {
  const previewTarget = ref<Backup | null>(null);
  const previewUrl = ref('');
  const previewLoading = ref(false);

  function closePreview() {
    previewTarget.value = null;
    previewUrl.value = '';
  }

  /**
   * 用 <a> 点击而不是 window.open：直链带 Content-Disposition: attachment，
   * 浏览器会落盘下载而不是开新标签。
   *
   * 两个必须避开的坑：
   * - click() 后立刻移除节点会取消还没来得及开始的下载，所以延后清理
   * - 浏览器限制「同一页面连续触发多个下载」（Chrome 的自动下载权限），
   *   同一时刻点 N 个只会落下第一个，所以按间隔错开逐个触发
   */
  function triggerDownload(url: string, delay: number) {
    setTimeout(() => {
      const link = document.createElement('a');
      link.href = url;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => link.remove(), 60_000);
    }, delay);
  }

  async function download(list: Backup[]) {
    // 文件夹没有 OSS 对象，签不出链接
    const ids = list.filter((item) => !item.isDir).map((item) => item.id).filter((id): id is string => !!id);
    if (!ids.length) {
      message.error('没有可下载的文件');
      return;
    }

    const urls: string[] = [];
    const failed: Failure[] = [];

    try {
      for (let i = 0; i < ids.length; i += DOWNLOAD_BATCH_MAX) {
        const res = await apiBackupDownloadBatch({ ids: ids.slice(i, i + DOWNLOAD_BATCH_MAX) });
        for (const vo of res.successList ?? []) {
          if (vo.url) urls.push(vo.url);
        }
        failed.push(...(res.failList ?? []));
      }
    } catch {
      // 失败提示由请求层统一处理
    }

    // 后端是逐个签发的，个别项失败不影响其余，但要知道数量对不对
    if (failed.length) message.error(`${failed.length} 个文件签不出下载链接`);

    if (!urls.length) {
      message.error('没有生成可用的下载链接');
      return;
    }

    urls.forEach((url, i) => triggerDownload(url, i * DOWNLOAD_INTERVAL));
    if (urls.length > 1) {
      message.info(`正在下载 ${urls.length} 个文件`);
    }
  }

  async function openPreview(item: Backup) {
    if (item.isDir || !item.id) return;

    // 不能内嵌预览的类型直接转下载
    if (!PREVIEW_KINDS.includes(kindOf(item))) {
      await download([item]);
      return;
    }

    previewTarget.value = item;
    previewUrl.value = '';
    previewLoading.value = true;
    try {
      const res = await apiBackupDownload({ id: item.id, inline: true });
      if (!res.url) {
        closePreview();
        message.error('无法生成预览链接');
        return;
      }
      previewUrl.value = res.url;
    } catch {
      closePreview();
    } finally {
      previewLoading.value = false;
    }
  }

  async function downloadPreview() {
    const item = previewTarget.value;
    if (item) await download([item]);
  }

  return { previewTarget, previewUrl, previewLoading, openPreview, closePreview, download, downloadPreview };
}
