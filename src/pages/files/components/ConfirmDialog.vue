<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

import AppDialog from '@/components/AppDialog.vue';

const props = defineProps<{ title: string; text: string; danger: boolean; loading: boolean }>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();

/** 回车确定。Esc 取消由 AppDialog 统一处理 */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || props.loading) return;

  // 焦点落在按钮上时交给按钮自己的 click，否则回车会和「取消」一起触发
  if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;

  // 消费掉这次回车：底下可能还压着编辑器，那个 textarea 仍有焦点，不收走会插进一个换行
  e.preventDefault();
  emit('confirm');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <AppDialog
    :title="title"
    confirm-text="确定"
    :danger="danger"
    :loading="loading"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  >
    <p class="fm__dialog-text">{{ text }}</p>
  </AppDialog>
</template>

<style scoped>
.fm__dialog-text {
  margin: 0;
  line-height: 1.6;
}
</style>
