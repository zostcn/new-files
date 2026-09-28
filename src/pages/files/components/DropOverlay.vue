<script setup lang="ts">
defineProps<{ dirName: string }>();
</script>

<template>
  <div class="fm__dropzone">
    <div>
      <p class="fm__dropzone-title">松开即上传</p>
      <p class="fm__dropzone-hint">上传到「{{ dirName }}」</p>
    </div>
  </div>
</template>

<style scoped>
/* 拖拽上传蒙层：pointer-events 关掉，否则会自己触发 dragleave 造成闪烁 */
.fm__dropzone {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(240, 245, 255, 0.88);
  border: 2px dashed #0052d9;
  pointer-events: none;
  text-align: center;
}

.fm__dropzone-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #0052d9;
}

.fm__dropzone-hint {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
}
</style>
