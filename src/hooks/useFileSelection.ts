import { computed, ref } from 'vue';

export function useFileSelection() {
  const selectedIds = ref<string[]>([]);
  const selectedCount = computed(() => selectedIds.value.length);

  function toggleSelect(id: string) {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id];
  }

  function clearSelection() {
    selectedIds.value = [];
  }

  return { selectedIds, selectedCount, toggleSelect, clearSelection };
}
