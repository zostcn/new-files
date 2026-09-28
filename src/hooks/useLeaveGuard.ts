import { onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';

/**
 * 有长任务在跑时拦一下刷新/关标签页。
 *
 * 直传没有断点续传，刷新一下就是整个文件从头再来（几 GB 可能就是几十分钟），
 * 而页面卸载时不会有任何提示——这个守卫填的就是这个静默丢失。
 *
 * **只是提醒，不是阻止**：拦不住用户硬要走，也不该拦。
 * 文案由浏览器给（自定义文字的方案早已废弃，所以这里不写 returnValue 的字符串）。
 *
 * 只覆盖页面级离开。应用内跳转（切回收站、退出登录）是 SPA 路由，不会触发
 * beforeunload；但那种情况下 XHR 不会被打断、文件照样传得完，只是看不到进度，
 * 危害小得多，所以不值得再叠一层路由守卫。
 */
export function useLeaveGuard(busy: Ref<boolean>) {
  function onBeforeUnload(e: BeforeUnloadEvent) {
    // Chrome 认 preventDefault，returnValue 是给老浏览器的
    e.preventDefault();
    e.returnValue = '';
  }

  watch(
    busy,
    (on) => {
      if (on) window.addEventListener('beforeunload', onBeforeUnload);
      else window.removeEventListener('beforeunload', onBeforeUnload);
    },
    // 挂载时就要对齐一次当前值，否则首帧已经在传（比如组件重建）会漏掉
    { immediate: true },
  );

  // 卸载时兜底摘掉：watch 的回调覆盖不到"卸载时 busy 仍为 true"这种情况，
  // 那样监听器会留在一个已经消失的页面上
  onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload));
}
