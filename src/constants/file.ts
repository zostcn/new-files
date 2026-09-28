/** 搜索与回收站的每页条数 */
export const PAGE_SIZE = 50;

/**
 * **目录浏览**的每页条数。刻意给到"大于一个目录里可能有的文件数"，也就是一次性拉全量：
 * 目录内翻页是纯粹的心智负担（翻页时选中态会清掉、排序后回第一页、Ctrl+F 搜不到没渲染的那几页），
 * 而按约定单个节点下不会超过 1000 个文件，一次 ~450KB 的元数据在本地链路上是几十毫秒的事。
 *
 * 分页器并没有因此被拆掉——它是**兜底**：`total > DIR_PAGE_SIZE` 时照样出现，
 * 所以万一哪天某个目录真的超了，结果还是看得全，只是退回到翻页。
 *
 * 搜索与回收站**必须继续用 PAGE_SIZE**：它们的结果集上界与"一个节点"无关
 * （搜索是跨全库 like name，回收站是跨目录按删除批次列），把它们的 pageSize 也放大
 * 等于一次把一个无界集合拉回来。
 */
export const DIR_PAGE_SIZE = 1000;

export const VIEW_MODE_KEY = 'file_view_mode';
export const SIDEBAR_KEY = 'sidebar_collapsed';

/**
 * **中转路径**的三道大小闸门，按请求经过的顺序：
 *   1. nginx  client_max_body_size               50 MiB  ← 按整个请求体算，**最紧的一层**
 *   2. Spring spring.servlet.multipart           50 MiB 单文件 / 200 MiB 单请求
 *   3. OSS    单次 PUT                            5 GiB
 *
 * 超限都是整个请求失败（在解析阶段就被拒，服务层拿不到文件、无法告知是哪个文件超了），
 * 所以只能在前端提前拦。**调 nginx 或后端配置时，这里必须同步。**
 *
 * 注意：只有 ≤ DIRECT_UPLOAD_THRESHOLD 的文件才走这条链路。超过阈值的走浏览器直传 OSS，
 * 完全绕开 nginx 与 Spring，因此不受这三道闸门约束，只受 DIRECT_UPLOAD_MAX 约束。
 */
export const MAX_REQUEST_SIZE = 50 * 1024 * 1024;

/** 分片阈值。请求体除了文件本身还要装 multipart 的边界行和 part 头（约几百字节），
 *  一片里又可能有多个 part 叠加这份开销，所以不能顶到 MAX_REQUEST_SIZE，留 2 MiB 余量 */
export const CHUNK_SIZE_LIMIT = MAX_REQUEST_SIZE - 2 * 1024 * 1024;

/**
 * 直传分流阈值：**大于**它的走浏览器直传 OSS，其余走上面的中转链路。
 *
 * 后端 backup.direct-upload.threshold 必须与此一致。后端不校验这个值——
 * 它只是前端的性能分流约定，不是安全边界（后端对任何 ≤ DIRECT_UPLOAD_MAX 的文件都照签 policy）。
 */
export const DIRECT_UPLOAD_THRESHOLD = 20 * 1024 * 1024;

/**
 * 直传单文件上限，与后端 backup.direct-upload.max-size 一致。
 * 真实拦截发生在 OSS 侧（policy 的 content-length-range），这里只是为了提前给出可读的提示，
 * 不然用户要等传到一半才收 EntityTooLarge。
 */
export const DIRECT_UPLOAD_MAX = 2 * 1024 * 1024 * 1024;

/**
 * 每批签发多少个 policy。
 *
 * 不能一次性为整批文件预签：上传是串行的，一批的 policy 共用一个过期时间，
 * 文件多、网速慢时后面的会在过期后才开始，OSS 直接回 AccessDenied。
 * 分批是按需签发的一种实现，批内自然收敛在一个很短的时间窗里。
 */
export const DIRECT_UPLOAD_BATCH = 5;

/** 单个分片的文件数上限 */
export const MAX_CHUNK_FILES = 50;
/** 后端 /backup/download-batch 单次最多接受的 id 数 */
export const DOWNLOAD_BATCH_MAX = 100;
/** 批量下载时逐个触发的间隔（毫秒） */
export const DOWNLOAD_INTERVAL = 600;

/** OSS 实时缩略图的宽度，与后端 applyThumbnail 的 THUMBNAIL_WIDTH 保持一致 */
export const THUMBNAIL_WIDTH = 200;

/**
 * 可在线查看/编辑的文本类型白名单。
 * 刻意按扩展名判定而不是复用 kindOf：那个分类里 doc 混着 .doc/.docx、sheet 混着 .xlsx，
 * 都是二进制，当文本打开只会是乱码。
 * 改这里时同步后端 BackupService 的 EDITABLE_TEXT_EXTENSIONS（服务端也会校验一遍）。
 */
export const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'yml',
  'yaml',
  'csv',
  'log',
  'ini',
  'conf',
  'cfg',
  'env',
  'properties',
  'toml',
  'xml',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'py',
  'java',
  'kt',
  'go',
  'rs',
  'c',
  'h',
  'cpp',
  'cs',
  'rb',
  'php',
  'sql',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'css',
  'scss',
  'sass',
  'less',
]);

/** 文本编辑的大小上限，与后端 MAX_TEXT_SIZE 一致 */
export const TEXT_MAX_SIZE = 1024 * 1024;

/**
 * 窄屏断点。scoped CSS 不能 import 这里的常量，改数值时记得同步各组件 @media 上的注释。
 * 取 640：横屏手机 667px 时侧边栏 220 + 表格最小 388 = 608 < 667，桌面布局真的放得下，不该切。
 */
export const NARROW_QUERY = '(max-width: 640px)';

/**
 * 触摸判定。用主指针的 hover/pointer，**绝不用 any- 前缀** ——
 * any-hover: hover 会把"接了鼠标的触屏笔记本"判成桌面。
 */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/** 长按判定为操作菜单的时长与允许的位移（超过就当作滚动） */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP = 10;

/** 清空回收站时，翻页取全部根节点用的每页条数 */
export const RECYCLE_PAGE_SIZE = 200;
/**
 * 彻底删除每批提交的根节点数。
 * purge 会逐个删 OSS 对象，是一次同步的长耗时请求，而请求层超时是 15 秒，
 * 一次提交太多必然超时，所以要分片。
 */
export const PURGE_CHUNK = 50;

export type FileKind = 'folder' | 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'archive' | 'code' | 'other';

/** 能在站内弹窗里内嵌预览的类型，其余一律转为下载 */
export const PREVIEW_KINDS: FileKind[] = ['image', 'video', 'audio', 'pdf'];
export type SortKey = 'name' | 'size' | 'time';
export type NavKey = 'all' | 'trash';
export type ViewMode = 'list' | 'grid';

// 按 Content-Type 匹配，顺序敏感，先命中先返回
export const CONTENT_KINDS: Array<[FileKind, string[]]> = [
  ['image', ['image/']],
  ['video', ['video/']],
  ['audio', ['audio/']],
  ['pdf', ['pdf']],
  ['sheet', ['spreadsheet', 'excel', 'csv']],
  ['archive', ['zip', 'compressed', 'tar', 'rar', '7z']],
  ['doc', ['word', 'document', 'text/']],
];

// Content-Type 没命中时按扩展名兜底
export const EXT_KINDS: Array<[FileKind, string[]]> = [
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']],
  ['video', ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv']],
  ['audio', ['mp3', 'wav', 'flac', 'aac', 'm4a']],
  ['pdf', ['pdf']],
  ['doc', ['doc', 'docx', 'md', 'rtf', 'txt']],
  ['sheet', ['xls', 'xlsx', 'csv']],
  ['archive', ['zip', 'rar', '7z', 'tar', 'gz']],
  ['code', ['json', 'js', 'ts', 'vue', 'py', 'java', 'html', 'css', 'yml', 'yaml']],
];

export const KIND_COLORS: Record<FileKind, string> = {
  folder: '#f0b429',
  image: '#0ea5e9',
  video: '#8b5cf6',
  audio: '#ec4899',
  pdf: '#dc2626',
  doc: '#2563eb',
  sheet: '#16a34a',
  archive: '#ca8a04',
  code: '#64748b',
  other: '#94a3b8',
};

export const FOLDER_ICON_PATH =
  'M3 6.5A2.5 2.5 0 0 1 5.5 4h3.2a2 2 0 0 1 1.6.8l1 1.3h7.2A2.5 2.5 0 0 1 21 8.6v8.9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z';
