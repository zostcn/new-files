import { onScopeDispose, readonly, ref } from 'vue';
import type { Ref } from 'vue';

/** 监听媒体查询。setup 时同步取初始值，避免首帧闪一下再切布局 */
export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const mq = window.matchMedia(query);
  const matches = ref(mq.matches);

  const onChange = (e: MediaQueryListEvent) => {
    matches.value = e.matches;
  };

  mq.addEventListener('change', onChange);
  onScopeDispose(() => mq.removeEventListener('change', onChange));

  return readonly(matches);
}
