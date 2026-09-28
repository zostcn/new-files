<script setup lang="ts">
import { onMounted, ref } from 'vue';

import AppDialog from '@/components/AppDialog.vue';

defineProps<{ modelValue: string; loading: boolean }>();

const emit = defineEmits<{ 'update:modelValue': [v: string]; confirm: []; cancel: [] }>();

const input = ref<HTMLTextAreaElement>();

// 不能靠 autofocus 属性：弹窗是动态插入的，浏览器对这类元素的 autofocus 处理不可靠。
// 刻意不像 NameDialog 那样 select() —— 全选对重命名是对的（整个名字换掉），
// 对描述是反的（一般是接着旧内容补两句）。
onMounted(() => {
  input.value?.focus();
});
</script>

<!-- 描述可能是一整句、也可能带换行，所以用 textarea，不能套 NameDialog 那个单行 input -->
<template>
  <AppDialog title="编辑描述" :loading="loading" @confirm="emit('confirm')" @cancel="emit('cancel')">
    <textarea
      ref="input"
      :value="modelValue"
      class="fm__dialog-textarea"
      rows="3"
      maxlength="255"
      placeholder="描述（可选）"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </AppDialog>
</template>

<style scoped>
.fm__dialog-textarea {
  width: 100%;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid #dcdcdc;
  border-radius: 6px;
  outline: none;
  /* 只允许纵向拉伸：横向拉会把卡片撑破 */
  resize: vertical;
}

.fm__dialog-textarea:focus {
  border-color: #0052d9;
}

/* ---------- 触摸设备（TOUCH_QUERY = hover: none） ---------- */
@media (hover: none) {
  /* iOS Safari 聚焦字号小于 16px 的输入框时会自动放大整个页面，只有把字号提到 16px 才能避免 */
  .fm__dialog-textarea {
    font-size: 16px;
  }
}
</style>
