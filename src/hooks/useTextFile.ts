import { computed, ref } from 'vue';

import { readTextContent, saveTextContent } from '@/api/backup';
import type { Backup } from '@/api/backup';
import { message } from '@/utils/message';

/** 文本文件的打开 / 编辑 / 保存 */
export function useTextFile(o: { reload: () => Promise<void> }) {
  const target = ref<Backup | null>(null);
  /** 编辑框里的内容 */
  const content = ref('');
  /** 打开时的原始内容，用来判断有没有改动 */
  const original = ref('');
  const loading = ref(false);
  const saving = ref(false);
  /** 读取失败的说明。留在弹窗里比 toast 更好定位 —— 弹窗开着却空着会让人困惑 */
  const error = ref('');

  const isDirty = computed(() => content.value !== original.value);

  async function open(item: Backup) {
    if (!item.id) return;

    target.value = item;
    content.value = '';
    original.value = '';
    error.value = '';
    loading.value = true;

    try {
      const res = await readTextContent(item.id);
      content.value = res.content ?? '';
      original.value = content.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : '读取失败';
    } finally {
      loading.value = false;
    }
  }

  function close() {
    target.value = null;
    content.value = '';
    original.value = '';
    error.value = '';
  }

  /**
   * 借一个不可见的 textarea 选中后 execCommand 复制。
   * 剪贴板 API 只在安全上下文（HTTPS / localhost）里存在，
   * 用局域网 IP 打开 dev server 时 navigator.clipboard 是 undefined，只能靠这条路。
   */
  function fallbackCopy(text: string) {
    const area = document.createElement('textarea');
    area.value = text;
    // 固定在视口内但全透明：iOS 上选中屏幕外的元素会顺带滚动页面
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);

    area.select();
    const ok = document.execCommand('copy');
    area.remove();

    if (!ok) throw new Error('execCommand copy 失败');
  }

  /** 把当前内容（含未保存的改动）整段复制到剪贴板 */
  async function copy() {
    const text = content.value;

    try {
      // 优先用异步剪贴板 API；它不存在（非安全上下文）或抛错时再退回老办法
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      message.success('已复制全部内容');
    } catch {
      try {
        fallbackCopy(text);
        message.success('已复制全部内容');
      } catch {
        message.error('复制失败，请手动选中后复制');
      }
    }
  }

  /** @param opts.close 存完是否收起弹窗。Ctrl+S 选择留在原地接着改 */
  async function save(opts?: { close?: boolean }) {
    const item = target.value;
    if (!item?.id || saving.value) return;

    saving.value = true;
    try {
      await saveTextContent(item.id, content.value);
      // 留在原地时得同步基准内容，否则关闭时会误判成有未保存的改动
      original.value = content.value;
      message.success('已保存');

      if (opts?.close) close();
      // 大小变了，列表和侧边栏用量都要跟着刷
      await o.reload();
    } catch {
      // 失败提示由请求层统一处理
    } finally {
      saving.value = false;
    }
  }

  return { target, content, original, loading, saving, error, isDirty, open, close, save, copy };
}
