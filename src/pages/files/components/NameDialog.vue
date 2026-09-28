<script setup lang="ts">
import { onMounted, ref } from 'vue';

import AppDialog from '@/components/AppDialog.vue';

defineProps<{ title: string; placeholder: string; modelValue: string; loading: boolean }>();

const emit = defineEmits<{ 'update:modelValue': [v: string]; confirm: []; cancel: [] }>();

const input = ref<HTMLInputElement>();

// 不能靠 autofocus 属性：弹窗是动态插入的，浏览器对这类元素的 autofocus 处理不可靠。
// 全选是为了重命名时直接输入就能替换旧名字（新建时内容为空，无副作用）。
onMounted(() => {
  input.value?.focus();
  input.value?.select();
});
</script>

<!-- 重命名和新建文件夹共用：都只是「填一个名字然后确定」 -->
<template>
  <AppDialog :title="title" :loading="loading" @confirm="emit('confirm')" @cancel="emit('cancel')">
    <input
      ref="input"
      :value="modelValue"
      class="fm__dialog-input"
      type="text"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keyup.enter="emit('confirm')"
    />
  </AppDialog>
</template>

<style scoped>
.fm__dialog-input {
  width: 100%;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 14px;
  border: 1px solid #dcdcdc;
  border-radius: 6px;
  outline: none;
}

.fm__dialog-input:focus {
  border-color: #0052d9;
}

/* ---------- 触摸设备（TOUCH_QUERY = hover: none） ---------- */
@media (hover: none) {
  /* iOS Safari 聚焦字号小于 16px 的输入框时会自动放大整个页面，只有把字号提到 16px 才能避免 */
  .fm__dialog-input {
    font-size: 16px;
  }
}
</style>
