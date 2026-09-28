<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { apiBackupList } from '@/api/backup';
import type { Backup, PathNode } from '@/api/backup';

import AppDialog from './AppDialog.vue';

defineProps<{
  /** 被移动的节点 id，禁止选中自身作为目标 */
  excludeIds: string[];
  movingCount: number;
}>();

const emit = defineEmits<{ confirm: [targetParentId: string]; cancel: [] }>();

const parentId = ref('');
const pathNodes = ref<PathNode[]>([]);
const folders = ref<Backup[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const vo = await apiBackupList({
      parentId: parentId.value || undefined,
      pageNum: 1,
      pageSize: 200,
    });
    pathNodes.value = vo.path ?? [];
    folders.value = (vo.page?.items ?? []).filter((r) => r.isDir);
  } catch {
    // 失败提示由请求层统一处理
  } finally {
    loading.value = false;
  }
}

function goTo(id: string) {
  parentId.value = id;
  load();
}

onMounted(load);
</script>

<template>
  <AppDialog
    title="移动到"
    confirm-text="移动到此处"
    :width="460"
    @confirm="emit('confirm', parentId)"
    @cancel="emit('cancel')"
  >
    <p class="mv__tip">已选 {{ movingCount }} 项，请选择目标文件夹</p>

    <nav class="mv__path">
      <button class="mv__crumb" type="button" @click="goTo('')">根目录</button>
      <template v-for="n in pathNodes" :key="n.id">
        <span class="mv__sep">/</span>
        <button class="mv__crumb" type="button" @click="goTo(n.id ?? '')">{{ n.name }}</button>
      </template>
    </nav>

    <div class="mv__list">
      <p v-if="loading" class="mv__hint">加载中…</p>
      <p v-else-if="!folders.length" class="mv__hint">当前目录没有子文件夹</p>
      <template v-else>
        <button
          v-for="f in folders"
          :key="f.id"
          class="mv__item"
          :disabled="excludeIds.includes(f.id ?? '')"
          type="button"
          @click="goTo(f.id ?? '')"
        >
          {{ f.name }}
        </button>
      </template>
    </div>
  </AppDialog>
</template>

<style scoped>
.mv__tip {
  margin: 0 0 10px;
  font-size: 13px;
  color: #8b929c;
}

.mv__path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  font-size: 13px;
  background: #f5f6f8;
  border-radius: 6px;
}

.mv__crumb {
  padding: 1px 4px;
  color: #4b5563;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.mv__crumb:hover {
  color: #0052d9;
  background: #e8f0fe;
}

.mv__sep {
  color: #c4c8ce;
}

.mv__list {
  height: 220px;
  margin-top: 10px;
  overflow-y: auto;
  border: 1px solid #e7e8ea;
  border-radius: 6px;
}

.mv__hint {
  margin: 0;
  padding: 20px 0;
  font-size: 13px;
  color: #a1a7b0;
  text-align: center;
}

.mv__item {
  display: block;
  width: 100%;
  padding: 9px 12px;
  font-size: 13px;
  color: #1f2329;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}

.mv__item:hover:not(:disabled) {
  background: #f5f6f8;
}

.mv__item:disabled {
  color: #c4c8ce;
  cursor: not-allowed;
}
</style>
