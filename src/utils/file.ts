import type { Backup } from '@/api/backup';
import { CONTENT_KINDS, EXT_KINDS, TEXT_EXTS, THUMBNAIL_WIDTH } from '@/constants/file';
import type { FileKind } from '@/constants/file';

/**
 * 给 OSS 图片地址接上实时缩略图后缀，避免为几十像素的展示位拉整张原图。
 * SVG 不在 OSS 图片处理的支持范围内，加上会直接 400，所以原样返回。
 */
export function ossThumbnail(url: string, width = THUMBNAIL_WIDTH) {
  if (!url) return url;

  const path = (url.split('?')[0] ?? '').toLowerCase();
  if (path.endsWith('.svg')) return url;

  return `${url}${url.includes('?') ? '&' : '?'}x-oss-process=image/resize,w_${width}`;
}

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

/** 能不能在线查看/编辑。没有扩展名的一律不放行 —— 无法判断是不是二进制 */
export function isTextFile(name?: string) {
  const ext = extOf(name ?? '');
  return !!ext && TEXT_EXTS.has(ext);
}

/**
 * 给没写扩展名的名字补一个。
 * 优先沿用原名（重命名 photo.png 成「风景」时得到「风景.png」，
 * 对应系统里「隐藏已知扩展名」的观感：你看到的只有主名，扩展名不会凭空丢掉），
 * 原本就没有扩展名的才落到 .txt（新建文件也走这条）。
 */
export function ensureExtension(name: string, original?: string) {
  if (name.includes('.')) return name;

  const ext = extOf(original ?? '');
  return `${name}.${ext || 'txt'}`;
}

export function kindOf(item: Backup): FileKind {
  if (item.isDir) return 'folder';

  const ct = item.contentType ?? '';
  for (const [kind, tokens] of CONTENT_KINDS) {
    if (tokens.some((t) => ct.includes(t))) return kind;
  }

  const ext = extOf(item.name ?? '');
  for (const [kind, exts] of EXT_KINDS) {
    if (exts.includes(ext)) return kind;
  }
  return 'other';
}

export function badgeOf(name?: string) {
  const ext = extOf(name ?? '');
  return ext ? ext.slice(0, 4).toUpperCase() : 'FILE';
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return '--';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }

  return `${i === 0 ? value : value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatSize(item: Backup) {
  if (item.isDir) return '--';

  const n = Number(item.size);
  if (!item.size || !Number.isFinite(n)) return '--';

  return formatBytes(n);
}

/**
 * 上传时间。刻意用 createdAt 而不是 updatedAt —— 后端的 sortBy=time 排的就是 createdAt，
 * 显示和排序必须用同一个字段，否则被重命名过的文件会"显示改名时间、却待在按上传时间算的位置"。
 */
export function uploadTimeOf(item: Backup) {
  return item.createdAt ?? '';
}

/**
 * 悬浮提示。有描述时是「名字 - 描述」，没有就只是名字。
 * label 给详情条那种标题位显示的是路径而不是名字的场景用。
 */
export function titleOf(item: Backup, label?: string) {
  const base = label || item.name || '';
  const full = item.description ? `${base} - ${item.description}` : base;

  // 什么都没有时返回 undefined，让 Vue 直接把属性摘掉 —— 写成 title="" 更糟：
  // 空 title 会被浏览器当成「最近的一个 title」，反而把祖先冒泡上来的提示吃掉
  return full || undefined;
}

/**
 * 文件所在的**目录**，给列表和卡片的副标题用（文件名在上面一行，这里不能再带一遍）。
 * 只有搜索结果（全局的）和回收站（脱离了原目录）需要显示，常规浏览返回空串。
 * 回收站的 deletedPath 是含文件名的完整路径快照，要切掉末段才是所在目录。
 */
export function locationOf(item: Backup, o: { searching: boolean; isTrash: boolean }) {
  if (!o.searching && !o.isTrash) return '';

  if (o.isTrash) {
    const segments = (item.deletedPath ?? '').split('/');
    segments.pop();
    // 在根目录被删除时 deletedPath 整段就是文件名，切完为空 —— 正好落到根目录
    return segments.join('/') || '根目录';
  }

  return item.parentPath || '根目录';
}

/**
 * 含文件名的**完整路径**，给底部详情用。
 * 回收站的 deletedPath 本身已含文件名，直接用；搜索的 parentPath 只是目录，要拼上文件名。
 * 常规浏览返回空串，调用方据此回落到只显示文件名。
 */
export function pathOf(item: Backup, o: { searching: boolean; isTrash: boolean }) {
  if (!o.searching && !o.isTrash) return '';

  const dir = locationOf(item, o);

  if (o.isTrash) {
    const snapshot = item.deletedPath;
    // 快照缺失或只剩文件名时，用「目录/文件名」补全，避免和文件名重复
    return snapshot && snapshot !== item.name ? snapshot : `${dir}/${item.name ?? ''}`;
  }

  return `${dir}/${item.name ?? ''}`;
}
