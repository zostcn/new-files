/**
 * 文件模块的 API 层 —— 旧 files（v1 `/api/backup*`）到 v2 `/api/file` 的兼容层。
 *
 * **保留 v1 的导出名与参数形状**（`apiBackupList({ pageNum, pageSize })` 这种），
 * 底层换成 orval 生成的 v2 客户端：hooks/组件的调用点因此几乎零改动，
 * 只有结果解析从 MP Page 的 `records` 换成 `PageResponse` 的 `items`。
 *
 * 与 v1 的差异（都在这里消化，不外溢）：
 * - 分页参数 `pageNum/pageSize` → v2 的 `page/size`；
 * - 响应分页形状 `records` → `items`（v2 不把 MP 的 Page 泄出，见 PageResponse 注释）；
 * - 类型 `Backup` = v2 `FileNodeVO` 的别名（字段名保持 v1 线上契约，id 全是字符串）。
 *
 * multipart 两个端点（upload-batch / upload-folder）继续**手写**：springdoc 把
 * `@RequestParam` 声明成 query，生成物发不出 FormData（v1 实测结论，原样保留）。
 */
import { http } from '@/api/client';
import {
  postFileDelete,
  postFileDescription,
  postFileDirectAbort,
  postFileDirectPolicy,
  postFileDownload,
  postFileDownloadBatch,
  postFileFolderCreate,
  postFileFolderStats,
  postFileList,
  postFileMove,
  postFileRecycleList,
  postFileRecyclePurge,
  postFileRecycleRestore,
  postFileRename,
  postFileSidebarList,
  postFileSidebarSet,
  postFileSidebarSort,
} from '@/api/generated';
import type {
  DirectCommitReq,
  Failure,
  FileListQuery,
  FileNodeVO,
} from '@/api/generated/models';

// ---------------- 类型重导出（旧名 → v2） ----------------

export type {
  BatchResultFileDownloadVO,
  BatchResultFileNodeVO,
  DirectPolicyVO,
  Failure,
  FileContentVO,
  FileDownloadVO,
  FileItem,
  FileListVO,
  FileNodeVO,
  FileStatsVO,
  PathNode,
  PolicyForm,
  PolicyItem,
} from '@/api/generated/models';

/** v1 的 `Backup` 实体类型 = v2 的 {@link FileNodeVO}（字段名保持 v1 线上契约）。 */
export type Backup = FileNodeVO;

// ---------------- 列表与回收站（参数名要翻译） ----------------

export interface ListParams {
  parentId?: string;
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
}

export function apiBackupList(params: ListParams) {
  const { pageNum, pageSize, ...rest } = params;
  const body: FileListQuery = { ...rest, page: pageNum, size: pageSize };
  return postFileList(body);
}

export function apiBackupRecycleList(params?: { pageNum?: number; pageSize?: number }) {
  return postFileRecycleList({ page: params?.pageNum, size: params?.pageSize });
}

// ---------------- 形状一致，直接别名 ----------------

export const apiBackupFolderCreate = postFileFolderCreate;
export const apiBackupRename = postFileRename;
export const apiBackupDescription = postFileDescription;
export const apiBackupMove = postFileMove;
export const apiBackupDelete = postFileDelete;
export const apiBackupDownload = postFileDownload;
export const apiBackupDownloadBatch = postFileDownloadBatch;
export const apiBackupFolderStats = postFileFolderStats;
export const apiBackupSidebarList = postFileSidebarList;
export const apiBackupSidebarSet = postFileSidebarSet;
export const apiBackupSidebarSort = postFileSidebarSort;
export const apiBackupRecyclePurge = postFileRecyclePurge;
export const apiBackupRecycleRestore = postFileRecycleRestore;
export const apiBackupDirectPolicy = postFileDirectPolicy;
export const apiBackupDirectAbort = postFileDirectAbort;

// ---------------- 手写（multipart / 超时特殊） ----------------

/** 文本请求单独超时：1MB 的文本在慢网上可能超过默认 15 秒 */
const TEXT_TIMEOUT = 60 * 1000;

/** 上传放宽超时且不重试：单文件上限 50MB，重试会把整个文件再传一遍 */
const UPLOAD_TIMEOUT = 5 * 60 * 1000;

/** 读取文本内容。非 UTF-8、超 1MB、类型不在白名单都由后端拒绝 */
export function readTextContent(id: string) {
  return http
    .post<{ content: string }>('/api/file/content', { id })
    .then((r) => r.data);
}

/** 保存文本内容，整体覆盖原文件，返回更新后的记录（size / updatedAt 已变） */
export function saveTextContent(id: string, content: string) {
  return http
    .post<Backup>('/api/file/content/save', { id, content }, { timeout: TEXT_TIMEOUT })
    .then((r) => r.data);
}

function postForm(url: string, form: FormData) {
  // FormData 走 http 实例:拦截器把它置成无超时(模板 B12 规则),不需要手传
  return http
    .post<{ successList: Backup[]; failList: Failure[] }>(url, form)
    .then((r) => r.data);
}

export function uploadBatch(files: File[], parentId?: string) {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  if (parentId) form.append('parentId', parentId);
  return postForm('/api/file/upload-batch', form);
}

export function uploadFolder(
  files: File[],
  paths: string[],
  emptyDirs: string[],
  parentId?: string,
) {
  const form = new FormData();
  files.forEach((file, i) => {
    form.append('files', file);
    // paths 与 files 按下标一一对应，错位会把文件传到错误的目录
    form.append('paths', paths[i] ?? '');
  });
  emptyDirs.forEach((dir) => form.append('dirs', dir));
  if (parentId) form.append('parentId', parentId);
  return postForm('/api/file/upload-folder', form);
}

/**
 * 新建空文本文件：复用批量上传（后端自动建 OSS 对象与记录，重名自动加序号）。
 * 内容给一个换行而不是空串——后端 `file.isEmpty()` 会拒 0 字节上传；
 * 文本末尾带换行也是 POSIX 惯例。
 */
export function createEmptyFile(name: string, parentId?: string) {
  const form = new FormData();
  form.append('files', new File(['\n'], name));
  if (parentId) form.append('parentId', parentId);
  return postForm('/api/file/upload-batch', form);
}

/**
 * 登记直传完成的对象。timeout 要放宽：commit 每个文件都要 headObject + copyObject。
 * （v1 的「retry 必须关」在模板的 client 里天然成立——模板请求层没有重试。）
 */
export function directCommit(dto: DirectCommitReq) {
  // JSON 请求吃不到 FormData 的自动放宽,超时要自己给:
  // commit 每个文件都要 headObject + copyObject,一批可能超过默认 15 秒
  return http
    .post<{ successList: Backup[]; failList: Failure[] }>('/api/file/direct/commit', dto, {
      timeout: UPLOAD_TIMEOUT,
    })
    .then((r) => r.data);
}
