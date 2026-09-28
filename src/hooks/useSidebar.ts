import { ref } from 'vue';

import { SIDEBAR_KEY } from '@/constants/file';

// 同步读取，保证首帧就是持久化的状态
function readCollapsed() {
  return localStorage.getItem(SIDEBAR_KEY) === '1';
}

export function useSidebar() {
  const collapsed = ref(readCollapsed());

  function toggleSidebar() {
    collapsed.value = !collapsed.value;
    localStorage.setItem(SIDEBAR_KEY, collapsed.value ? '1' : '0');
  }

  return { collapsed, toggleSidebar };
}
