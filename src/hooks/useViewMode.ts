import { ref } from 'vue';

import { VIEW_MODE_KEY } from '@/constants/file';
import type { ViewMode } from '@/constants/file';

// 同步读取，保证首帧就是持久化的视图
function readViewMode(): ViewMode {
  return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid';
}

export function useViewMode() {
  const viewMode = ref<ViewMode>(readViewMode());

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  return { viewMode, setViewMode };
}
