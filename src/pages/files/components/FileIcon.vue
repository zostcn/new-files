<script setup lang="ts">
import { computed } from 'vue';

import { FOLDER_ICON_PATH, KIND_COLORS } from '@/constants/file';
import type { FileKind } from '@/constants/file';
import { badgeOf } from '@/utils/file';

const props = withDefaults(
  defineProps<{
    kind: FileKind;
    url?: string;
    name?: string;
    size?: 'sm' | 'lg';
    thumbFailed?: boolean;
  }>(),
  { size: 'sm', thumbFailed: false, url: undefined, name: '' },
);

const emit = defineEmits<{ thumbError: [] }>();

const isLg = computed(() => props.size === 'lg');
const showThumb = computed(() => props.kind === 'image' && !!props.url && !props.thumbFailed);
const badge = computed(() => badgeOf(props.name));
</script>

<template>
  <img
    v-if="showThumb"
    class="fm__thumb"
    :class="{ 'fm__thumb--lg': isLg }"
    :src="url"
    :alt="name"
    loading="lazy"
    :draggable="false"
    @error="emit('thumbError')"
  />
  <span
    v-else-if="kind === 'folder'"
    class="fm__folder-icon"
    :class="{ 'fm__folder-icon--lg': isLg }"
    :style="{ color: KIND_COLORS.folder }"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" fill="currentColor"><path :d="FOLDER_ICON_PATH" /></svg>
  </span>
  <span
    v-else
    class="fm__badge"
    :class="{ 'fm__badge--lg': isLg }"
    :style="{ background: KIND_COLORS[kind] }"
    aria-hidden="true"
  >
    {{ badge }}
  </span>
</template>

<style scoped>
.fm__folder-icon {
  display: flex;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.fm__folder-icon svg {
  display: block;
  width: 100%;
  height: 100%;
}

.fm__folder-icon--lg {
  width: 46px;
  height: 46px;
}

.fm__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  font-size: 8px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.3px;
  border-radius: 5px;
}

.fm__badge--lg {
  width: 46px;
  height: 46px;
  font-size: 11px;
  border-radius: 8px;
}

.fm__thumb {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  object-fit: cover;
  background: #f0f1f3;
  border-radius: 5px;
}

.fm__thumb--lg {
  width: 46px;
  height: 46px;
  border-radius: 8px;
}
</style>
