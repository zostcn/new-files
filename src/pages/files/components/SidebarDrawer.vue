<script setup lang="ts">
defineProps<{ open: boolean; narrow: boolean }>();

const emit = defineEmits<{ close: [] }>();
</script>

<!--
  遮罩必须是抽屉的兄弟节点而不是子节点：抽屉上有 transform，
  而 transform 会成为 position: fixed 的包含块 —— 放里面的话遮罩会缩成抽屉那么宽，盖不住全屏。
-->
<template>
  <div v-if="narrow && open" class="drawer__mask" @click="emit('close')" />

  <div class="drawer" :class="{ 'drawer--open': open }">
    <slot />
  </div>
</template>

<style scoped>
/* 桌面端：外层退化成透明层，不占位、不参与布局 */
.drawer {
  display: contents;
}

/* ---------- 窄屏（NARROW_QUERY = max-width: 640px） ---------- */
@media (max-width: 640px) {
  .drawer {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    /* 高于右键菜单(50)：打开的菜单不该飘在抽屉上；低于弹窗(100)：对话框仍在最上 */
    z-index: 60;
    display: flex;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }

  .drawer--open {
    transform: none;
  }

  .drawer__mask {
    position: fixed;
    inset: 0;
    z-index: 55;
    background: rgba(15, 23, 42, 0.35);
  }
}
</style>
