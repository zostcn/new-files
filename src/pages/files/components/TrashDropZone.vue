<script setup lang="ts">
defineProps<{ over: boolean }>();

const emit = defineEmits<{ dragOver: [e: DragEvent]; dragLeave: [e: DragEvent]; drop: [e: DragEvent] }>();
</script>

<!-- 拖动条目时出现，位置和多选浮层一样，两者互斥（拖动中按钮也用不了） -->
<template>
  <div
    class="tdz"
    :class="{ 'tdz--over': over }"
    @dragover="emit('dragOver', $event)"
    @dragleave="emit('dragLeave', $event)"
    @drop="emit('drop', $event)"
  >
    拖到此处移入回收站
  </div>
</template>

<style scoped>
.tdz {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: var(--fm-bottombar-h);
  padding: 0 24px;
  font-size: 13px;
  color: #8b929c;
  background: #fafbfc;
  border-top: 1px dashed #c4c8ce;
}

.tdz--over {
  color: #d54941;
  background: #fdeceb;
  border-top-color: #d54941;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .tdz {
    /* 高度松绑：固定高度就没法再叠 safe-area 的额外下边距了 */
    height: auto;
    padding: 12px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
