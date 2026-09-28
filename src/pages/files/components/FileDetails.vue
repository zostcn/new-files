<script setup lang="ts">
import type { Backup } from '@/api/backup';
import { formatSize, titleOf } from '@/utils/file';

defineProps<{
  item: Backup;
  /** 含文件名的完整路径（只有搜索/回收站才有）。有它就顶替文件名那一格，不再重复展示名字 */
  path?: string;
}>();
</script>

<template>
  <div class="fd">
    <!-- 描述嵌在标题这一个框里而不是新起一格：这一条必须单行，
         嵌套的行内元素会跟着父级的 text-overflow 一起省略号截断 -->
    <span class="fd__title" :title="titleOf(item, path || item.name)">
      {{ path || item.name }}<span v-if="item.description" class="fd__desc"> - {{ item.description }}</span>
    </span>
    <span class="fd__sep">·</span>
    <span class="fd__meta">{{ formatSize(item) }}</span>
  </div>
</template>

<style scoped>
/* 内容区最靠下的一条，永远贴着底边 —— 这样它能和侧边栏的存储空间齐平。
   单行是硬要求：有它撑高度时这一条才能稳定在 --fm-bottombar-h */
.fd {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  height: var(--fm-bottombar-h);
  padding: 0 24px;
  font-size: 13px;
  background: #fafbfc;
  border-top: 1px solid #e7e8ea;
}

.fd__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #1f2329;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fd__meta {
  flex-shrink: 0;
  color: #6b7280;
  white-space: nowrap;
}

/* 描述比名字次要，压暗一档；截断交给父级 .fd__title 的 text-overflow */
.fd__desc {
  color: #8b929c;
}

.fd__sep {
  flex-shrink: 0;
  color: #c4c8ce;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .fd {
    /* 高度松绑：固定高度就没法再叠 safe-area 的额外下边距了 */
    height: auto;
    padding: 12px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
