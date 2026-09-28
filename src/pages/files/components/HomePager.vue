<script setup lang="ts">
defineProps<{ pageNum: number; totalPages: number; total: number }>();

const emit = defineEmits<{ change: [page: number] }>();
</script>

<template>
  <div class="fm__pager">
    <button class="fm__btn" type="button" :disabled="pageNum <= 1" @click="emit('change', pageNum - 1)">
      上一页
    </button>
    <span class="fm__pageinfo">{{ pageNum }} / {{ totalPages }} · 共 {{ total }} 项</span>
    <button class="fm__btn" type="button" :disabled="pageNum >= totalPages" @click="emit('change', pageNum + 1)">
      下一页
    </button>
  </div>
</template>

<style scoped>
.fm__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  /* 和内容区底部其他几条统一高度，这样它在最底下时也能和侧边栏的存储空间对齐 */
  height: var(--fm-bottombar-h);
  padding: 0 24px;
  border-top: 1px solid #e7e8ea;
}

.fm__pageinfo {
  font-size: 13px;
  color: #6b7280;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .fm__pager {
    gap: 8px;
    padding: 0 12px;
  }
}
</style>
