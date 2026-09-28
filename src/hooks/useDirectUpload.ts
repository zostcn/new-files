import { onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';

import { directCommit } from '@/api/backup';
import { apiBackupDirectAbort, apiBackupDirectPolicy } from '@/api/backup';
import type {
  DirectPolicyVO,
  Failure,
  FileItem,
  PolicyItem,
  PolicyForm,
} from '@/api/backup';
import { DIRECT_UPLOAD_BATCH, DIRECT_UPLOAD_MAX } from '@/constants/file';
import { formatBytes } from '@/utils/file';

export type DirectUploadStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'committing'
  | 'success'
  | 'failed'
  | 'canceled';

/**
 * 直传的逐项状态。批量上传时互不影响，将来把 XHR 换成 OSS 分片也只动中间那段，
 * 这个形状不用改（分片要额外记 uploadId，届时再加字段即可）。
 */
export interface DirectUploadItem {
  file: File;
  path: string;
  status: DirectUploadStatus;
  /** 0~1，仅 uploading 期间有意义 */
  progress: number;
  /**
   * 签发时拿到的 pending key。**拿到 ≠ 已传完**——它在上传开始前就填上了，
   * 这样取消时能凭它清理掉"授权已给、字节可能已经落了一半"的那批对象。
   */
  objectKey?: string;
  error?: string;
}

/** OSS 直传返回的错误。带错误码是为了把 OSS 的错误映射成人话提示，而不是只甩一个状态码 */
export class OssUploadError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`OSS 直传失败：${code}`);
    this.code = code;
  }
}

/**
 * 把 OSS 错误码翻译成人话。未覆盖的码原样透出，总比一句"上传失败"有信息量。
 *
 * 后三个是**本地合成**的码，不是 OSS 返回的：断网是直传最常见的失败，
 * 不翻的话用户只会看到 "NetworkError"。
 */
const OSS_ERROR_HINTS: Record<string, string> = {
  EntityTooLarge: `超过单文件直传上限（${formatBytes(DIRECT_UPLOAD_MAX)}）`,
  AccessDenied: '直传授权已过期或签名不匹配',
  InvalidAccessKeyId: '临时凭证无效',
  SecurityTokenExpired: '临时凭证已过期，请重新上传',
  SignatureDoesNotMatch: '签名不匹配',
  NetworkError: '网络中断，请检查网络后重试',
  Timeout: '上传超时',
  Aborted: '上传被中断',
};

function describeError(e: unknown): string {
  if (e instanceof OssUploadError) {
    return OSS_ERROR_HINTS[e.code] ?? e.message;
  }
  return e instanceof Error ? e.message : '上传失败';
}

/** 从 OSS 的 XML 错误体里抠错误码；抠不到就退回 HTTP 状态 */
function errorCodeOf(xhr: XMLHttpRequest): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(xhr.responseText ?? '')?.[1];
  if (code) return code;
  return xhr.status === 0 ? 'NetworkError' : `HTTP ${xhr.status}`;
}

/** requireIssued 收口之后的形状：字段全部非可选，下游不用再写非空断言 */
interface ResolvedPolicy {
  objectKey: string;
  path: string;
  form: Required<PolicyForm>;
}

/**
 * 生成的类型里字段**全是可选的**（OpenAPI 生成器的通病），但这几项缺了就没法上传。
 * 在这里一次性收口，后面就都是非空的了。
 */
function requireIssued(issued: PolicyItem | undefined): ResolvedPolicy {
  const form = issued?.form;
  if (
    !issued?.objectKey ||
    !issued.path ||
    !form?.key ||
    !form.OSSAccessKeyId ||
    !form.policy ||
    !form.signature ||
    !form['x-oss-security-token'] ||
    !form['Content-Type']
  ) {
    throw new Error('直传授权字段不完整');
  }
  return { objectKey: issued.objectKey, path: issued.path, form: form as Required<PolicyForm> };
}

/**
 * 进度回写的最小间隔。一次大文件的 onprogress 会触发上千次，
 * 每次都写响应式状态等于把渲染打爆。
 */
const PROGRESS_INTERVAL_MS = 100;

/**
 * 全部成功后面板自动收起前的停留时间。
 * 够看清"已完成"，又不至于一直占着内容区右下角。
 */
const SUCCESS_CLOSE_MS = 2000;

/**
 * 把文件 POST 到 OSS。
 *
 * 用 XHR 而不是 fetch：fetch 拿不到上传进度（没有 upload.onprogress）。
 * 同时不做超时——几 GB 的文件在慢链路上耗上十几分钟是正常的，
 * 设了反而会把正常上传腰斩；要停由 cancel() 显式 abort。
 */
function postToOss(
  uploadUrl: string,
  form: Required<PolicyForm>,
  file: File,
  onProgress: (p: number) => void,
  inflight: Set<XMLHttpRequest>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    inflight.add(xhr);
    // 每条出口都要摘掉，否则取消后这个 Set 会成为已结束请求的坟场
    const settle = () => inflight.delete(xhr);

    xhr.open('POST', uploadUrl);

    let lastAt = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total <= 0) return;
      const now = Date.now();
      // 末次的 100% 必须放行，否则进度条会卡在 99% 直到上传完
      if (now - lastAt < PROGRESS_INTERVAL_MS && e.loaded < e.total) return;
      lastAt = now;
      onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      settle();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new OssUploadError(errorCodeOf(xhr)));
    };
    xhr.onerror = () => {
      settle();
      reject(new OssUploadError('NetworkError'));
    };
    xhr.onabort = () => {
      settle();
      reject(new OssUploadError('Aborted'));
    };
    xhr.ontimeout = () => {
      settle();
      reject(new OssUploadError('Timeout'));
    };

    const body = new FormData();
    // 普通字段在前，file 必须最后
    body.append('key', form.key);
    body.append('OSSAccessKeyId', form.OSSAccessKeyId);
    body.append('policy', form.policy);
    body.append('signature', form.signature);
    body.append('x-oss-security-token', form['x-oss-security-token']);
    body.append('success_action_status', '200');
    body.append('Content-Type', form['Content-Type']);
    // 刻意不直接 append 裸 file：把 part 自带的 Content-Type 也拧成后端锁定的那个值。
    // OSS 到底认「同名表单字段」还是认「part 自带的类型」没有保证，两个都设上就不用赌。
    // 用 File 包一层是引用级操作，不会把文件读进内存。
    body.append('file', new File([file], file.name, { type: form['Content-Type'] }));

    xhr.send(body);
  });
}

const toPolicyFile = (it: DirectUploadItem): FileItem => ({
  path: it.path,
  size: it.file.size,
  // File.type 在部分系统上会是空串，给个兜底免得后端白名单判成"不在白名单"而回落
  contentType: it.file.type || 'application/octet-stream',
});

const failureOf = (it: DirectUploadItem, reason: string): Failure => ({ name: it.path, reason });

/**
 * 按 key 顺序取出配对的条目。
 * 同名文件可能在一次选择里出现多次，所以按顺序消费而不是查唯一。
 * 成功项用 path 配对（后端 PolicyItem 上叫 path），失败项用 name 配对（BatchResultVO.Failure 的形状），
 * 所以键提取由调用方给。
 */
function createQueue<T>(list: T[], keyOf: (row: T) => string | undefined) {
  const byKey = new Map<string, T[]>();
  for (const row of list) {
    const key = keyOf(row);
    if (key === undefined) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return (key: string) => {
    const bucket = byKey.get(key);
    return bucket && bucket.length ? bucket.shift() : undefined;
  };
}

/**
 * 一轮上传的运行态。做成对象而不是闭包变量，是为了让 cancel() 能精确地
 * 只掐掉该掐的那一轮——若用共享的布尔量，取消后紧接着发起新一轮，
 * 新一轮复位标志会把上一轮的取消吞掉。
 */
interface RunState {
  canceled: boolean;
  /** 本轮签发出去的 pending key，取消时据此清理 */
  issued: Array<{ objectKey: string; it: DirectUploadItem }>;
}

export function useDirectUpload() {
  const items: Ref<DirectUploadItem[]> = ref([]);
  /** 是否有直传正在跑。面板据此决定显示"取消"还是"关闭" */
  const active = ref(false);

  /** 正在飞的 XHR。串行上传时同时最多一个，用 Set 是为了将来改并发不用动这里 */
  const inflight = new Set<XMLHttpRequest>();
  /** 所有在跑的轮次。取消是"停掉全部"，所以不区分是哪一轮 */
  const runs = new Set<RunState>();

  /** 取消：掐掉所有在飞的请求，并让各轮在下一个检查点收尾清理 */
  function cancel() {
    for (const run of runs) run.canceled = true;
    for (const xhr of [...inflight]) xhr.abort();
  }

  /** 自动收起的定时器。只在"全部成功"时挂上，理由见下面的 watch */
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function clearCloseTimer() {
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  }

  /** 清空面板。每次用户发起上传时调，避免上一次的结果一直挂在屏幕上 */
  function reset() {
    // 面板都收掉了，那个等着自动收起的定时器也就没有意义了
    clearCloseTimer();
    items.value = [];
  }

  /**
   * 全部成功时自动收起面板，2 秒后。
   *
   * **有失败或有取消就不收**：失败原因只挂在这个面板上，2 秒后收掉等于用户再也看不到
   * 是哪个文件、为什么失败（那个 toast 只说"N 个文件失败"）。取消同理——用户刚点的取消，
   * 该让他看清结果再自己关。
   *
   * 第一行的 clearCloseTimer 是关键：这一批跑完的 2 秒内用户又发起新一批，
   * active 会翻回 true，那个还挂着的定时器必须掐掉，否则它会把新一批刚填上的 items 清空。
   */
  watch(active, (on) => {
    clearCloseTimer();
    if (on) return;
    if (!items.value.length) return;
    if (!items.value.every((it) => it.status === 'success')) return;

    closeTimer = setTimeout(() => {
      closeTimer = undefined;
      items.value = [];
    }, SUCCESS_CLOSE_MS);
  });

  // 卸载时别留一个孤儿定时器——它会去写一个已经没人在看的 ref
  onUnmounted(clearCloseTimer);

  /**
   * 删除已签发但没走到成功的 pending 对象。
   *
   * **只清「被取消」与「传完但没来得及登记」这两类，不清「失败」的**：失败要保留 pending
   * 让用户能重试（key 仍有效、对象仍在、DB 无行所以不会被"已引用"挡掉），这与 commit 的
   * 补偿方向一致。已 success 的更不用管——commit 成功时就把它删了。
   */
  async function abortIssued(run: RunState) {
    const keys = run.issued
      .filter((e) => e.it.status !== 'success' && e.it.status !== 'failed')
      .map((e) => e.objectKey);
    if (!keys.length) return;

    try {
      await apiBackupDirectAbort({ objectKeys: keys });
    } catch {
      // best-effort：桶生命周期规则是最终兜底。这里不额外提示——
      // 用户刚点了取消，再弹一条"清理失败"只会让人以为文件出问题了
    }
  }

  /**
   * 直传一个批次（签 policy → 逐个传 → 登记）。
   *
   * 分批而不是整批预签：同一批的 policy 共用一个过期时间，串行上传时后面的文件
   * 会在过期后才开始。分批让窗口自然收敛，也让失败只影响当前批。
   *
   * **刻意不做任何自动重试。** AccessDenied 看着像"授权过期、再签一份就好"，但它
   * 同时也是"角色没权限"的表现，而后者重试必然再失败——代价是把整个文件（可能几 GB）
   * 白传一遍。两种成因的错误码相同、无法可靠区分，所以不赌：
   * 真过期了就报失败让用户重传，也不拿一个多 GB 的文件去试。
   */
  async function uploadBatch(batch: DirectUploadItem[], parentId: string | undefined, run: RunState) {
    let ok = 0;
    const fails: Failure[] = [];

    let issued: DirectPolicyVO;
    try {
      issued = await apiBackupDirectPolicy({ parentId, files: batch.map(toPolicyFile) });
    } catch (e) {
      // 整个请求就没成（目录非法、后端签名器未就绪等）：这一批判全失败。
      // 不往 fails 里塞——这一类是**请求层抛的**，它已经弹过一次后端 msg 了，
      // 再报一次就是同一条消息弹两遍（中转路径也是这么处理的，见 useUpload）。
      const reason = describeError(e);
      for (const it of batch) {
        it.status = 'failed';
        it.error = reason;
      }
      return { ok, fails };
    }

    // 上传目标域名缺了就没法传（POST 到空串会打到本站 origin 并拿到 200，被误判成成功）。
    // requireIssued 管不到它——那是 VO 上的字段，不在每个 item 上
    if (!issued.uploadUrl) {
      const reason = '直传目标域名缺失';
      for (const it of batch) {
        it.status = 'failed';
        it.error = reason;
      }
      fails.push(...batch.map((it) => failureOf(it, reason)));
      return { ok, fails };
    }

    // 后端按输入顺序处理，成功项与失败项各自保持相对顺序，按 key 逐个消费即可配对
    const takeIssued = createQueue(issued.items ?? [], (r) => r.path);
    const takeFailed = createQueue(issued.failList ?? [], (r) => r.name);

    const uploaded: Array<{ objectKey: string; path: string }> = [];
    const byObjectKey = new Map<string, DirectUploadItem>();

    for (const it of batch) {
      if (run.canceled) {
        it.status = 'canceled';
        continue;
      }

      const rejected = takeFailed(it.path);
      if (rejected) {
        const reason = rejected.reason || '签发直传授权失败';
        it.status = 'failed';
        it.error = reason;
        fails.push(failureOf(it, reason));
        continue;
      }

      const policyItem = takeIssued(it.path);
      if (!policyItem) {
        const reason = '未拿到直传授权';
        it.status = 'failed';
        it.error = reason;
        fails.push(failureOf(it, reason));
        continue;
      }

      let done: ResolvedPolicy;
      try {
        done = requireIssued(policyItem);
      } catch (e) {
        const reason = describeError(e);
        it.status = 'failed';
        it.error = reason;
        fails.push(failureOf(it, reason));
        continue;
      }

      // 拿到 key 就先记上，再开始传：中途被取消时靠它清理
      it.objectKey = done.objectKey;
      run.issued.push({ objectKey: done.objectKey, it });

      it.status = 'uploading';
      it.progress = 0;
      try {
        await postToOss(issued.uploadUrl, done.form, it.file, (p) => {
          it.progress = p;
        }, inflight);
        it.status = 'uploaded';
        it.progress = 1;
        uploaded.push({ objectKey: done.objectKey, path: done.path });
        byObjectKey.set(done.objectKey, it);
      } catch (e) {
        // 取消导致的 abort 不是失败：不算进 fails，也不写 error，
        // 否则用户点了取消还会收到一串"上传被中断"的报错
        if (run.canceled && e instanceof OssUploadError && e.code === 'Aborted') {
          it.status = 'canceled';
          continue;
        }
        const reason = describeError(e);
        it.status = 'failed';
        it.error = reason;
        fails.push(failureOf(it, reason));
      }
    }

    // 取消时不做登记：用户要的是"停下来"，把已传完的几个悄悄落库反而更意外
    if (run.canceled) return { ok, fails };
    if (!uploaded.length) return { ok, fails };

    // 登记。这里失败的对象留在 pending（有桶生命周期兜底），不会变成看不见的孤儿
    for (const it of byObjectKey.values()) it.status = 'committing';
    try {
      const res = await directCommit({ parentId, items: uploaded });
      const takeCommitFailed = createQueue(res.failList ?? [], (r) => r.name);
      for (const it of byObjectKey.values()) {
        const rejected = takeCommitFailed(it.path);
        if (rejected) {
          it.error = rejected.reason || '登记失败';
          it.status = 'failed';
          fails.push(failureOf(it, it.error));
        } else {
          it.status = 'success';
        }
      }
      ok += res.successList?.length ?? uploaded.length;
    } catch (e) {
      // 同 policy：请求层已经提示过了，这里只标状态不再报
      const reason = describeError(e);
      for (const it of byObjectKey.values()) {
        it.status = 'failed';
        it.error = reason;
      }
    }

    return { ok, fails };
  }

  /**
   * 直传入口。entries 的 path 语义与 uploadFolder 的 paths[] 一致，
   * 单文件/批量上传时就是文件名，文件夹上传时是相对路径。
   */
  async function uploadDirect(entries: Array<{ file: File; path: string }>, parentId?: string) {
    items.value = entries.map((e) => ({
      file: e.file,
      path: e.path,
      status: 'pending',
      progress: 0,
    }));

    // 后面一律用这个本地引用，不回读 items.value：两批并发时（拖拽入口没有"上传中"守卫）
    // 新一轮会把 items.value 换掉，这一轮的收尾就会去改别人家的条目。
    //
    // 但它必须取自 items.value（也就是那个响应式代理），**不能**用上面 map 出来的原始数组：
    // 绕过代理改属性不触发渲染，进度条会一直不动、直到别的原因引发一次重渲染
    // （比如跑完时 active 翻转）才突然跳到终态。
    const list = items.value;

    const run: RunState = { canceled: false, issued: [] };
    runs.add(run);
    active.value = true;

    let ok = 0;
    const fails: Failure[] = [];

    try {
      // 超过硬上限的不进直传流程：与其传一半被 OSS 回 EntityTooLarge，不如提前给结果
      const candidates: DirectUploadItem[] = [];
      for (const it of list) {
        if (it.file.size > DIRECT_UPLOAD_MAX) {
          const reason = `超过单文件上限 ${formatBytes(DIRECT_UPLOAD_MAX)}`;
          it.status = 'failed';
          it.error = reason;
          fails.push(failureOf(it, reason));
        } else {
          candidates.push(it);
        }
      }

      for (let i = 0; i < candidates.length; i += DIRECT_UPLOAD_BATCH) {
        if (run.canceled) break;
        const batchResult = await uploadBatch(candidates.slice(i, i + DIRECT_UPLOAD_BATCH), parentId, run);
        ok += batchResult.ok;
        fails.push(...batchResult.fails);
      }

      // 取消后收尾：把没走完的项统一标成已取消，再清理已签发的对象。
      // 放在这里而不是 cancel() 里，是因为 cancel() 只该打断请求，
      // 收尾要等上传循环真的解开之后才安全。
      //
      // 'uploaded' / 'committing' 也要一起标：取消时这一批已经放弃登记，
      // 留着"待登记"会让面板一直挂着一个永远不会有下文的中间态
      if (run.canceled) {
        for (const it of list) {
          if (it.status !== 'success' && it.status !== 'failed') it.status = 'canceled';
        }
        await abortIssued(run);
      }
    } finally {
      runs.delete(run);
      active.value = false;
    }

    return { ok, fails };
  }

  return { uploadDirect, items, active, cancel, reset };
}
