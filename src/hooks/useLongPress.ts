import { onBeforeUnmount } from 'vue';

import { LONG_PRESS_MS, LONG_PRESS_SLOP } from '@/constants/file';

/**
 * 长按控制器。做成"一个实例管所有行"而不是每行一个 hook ——
 * 行是 v-for 渲染的，per-element hook 既浪费又不好取消。
 */
export function useLongPress<T>(onFire: (payload: T, e: PointerEvent) => void, o?: { duration?: number; slop?: number }) {
  const duration = o?.duration ?? LONG_PRESS_MS;
  const slop = o?.slop ?? LONG_PRESS_SLOP;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let clearSuppress: ReturnType<typeof setTimeout> | undefined;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  /** 长按已触发：随后那次 click 要吃掉，否则会顺带打开文件夹 */
  let suppress = false;

  function stop() {
    clearTimeout(timer);
    timer = undefined;
  }

  function press(e: PointerEvent, payload: T) {
    // 鼠标只认左键；触摸/触控笔的 button 都是 0
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    stop();
    suppress = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;

    timer = setTimeout(() => {
      timer = undefined;
      suppress = true;
      onFire(payload, e);

      // 兜底：部分浏览器长按后既不发 click 也不发 contextmenu，
      // 不自动清标志就会把用户下一次点击吃掉
      clearSuppress = setTimeout(() => {
        suppress = false;
      }, 350);
    }, duration);
  }

  function move(e: PointerEvent) {
    if (!timer || e.pointerId !== pointerId) return;
    // pointercancel 在 Safari 上触发得很懒，位移阈值才是真正的保险
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > slop) stop();
  }

  function release(e: PointerEvent) {
    if (e.pointerId === pointerId) stop();
  }

  function cancel() {
    stop();
    pointerId = -1;
  }

  /** 长按触发后的那次 click 返回一次 true，后续调用返回 false */
  function consumeClick() {
    if (!suppress) return false;

    suppress = false;
    clearTimeout(clearSuppress);
    return true;
  }

  onBeforeUnmount(() => {
    stop();
    clearTimeout(clearSuppress);
  });

  return { press, move, release, cancel, consumeClick };
}
