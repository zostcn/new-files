<script setup lang="ts">
defineProps<{ count: number; isTrash: boolean }>();

const emit = defineEmits<{ move: []; delete: []; restore: []; purge: []; clear: []; download: [] }>();
</script>

<template>
  <div class="fm__selbar">
    <span class="fm__selcount">已选 {{ count }} 项</span>
    <template v-if="isTrash">
      <button class="fm__btn" type="button" @click="emit('restore')">恢复</button>
      <button class="fm__btn fm__btn--danger" type="button" @click="emit('purge')">彻底删除</button>
    </template>
    <template v-else>
      <button class="fm__btn" type="button" @click="emit('download')">下载</button>
      <button class="fm__btn" type="button" @click="emit('move')">移动到</button>
      <button class="fm__btn fm__btn--danger" type="button" @click="emit('delete')">移入回收站</button>
    </template>
    <button class="fm__mini" type="button" @click="emit('clear')">取消选择</button>
  </div>
</template>

<style scoped>
/* 内容区最靠下的一条，永远贴着底边 —— 这样它能和侧边栏的存储空间齐平 */
.fm__selbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  height: var(--fm-bottombar-h);
  padding: 0 24px;
  background: #f0f5ff;
  border-top: 1px solid #d6e4ff;
}

.fm__selcount {
  margin-right: 8px;
  font-size: 13px;
  color: #0052d9;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .fm__selbar {
    /* 375px 下这一行内容约 430px，必须允许换行。
       高度松绑：换行后行数不定，而且固定高度就没法再叠 safe-area 的额外下边距 */
    height: auto;
    flex-wrap: wrap;
    padding: 8px 12px;
    /* iOS 手势条会压在这条上面 */
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
