<script setup lang="ts">
import { onMounted, ref } from 'vue'
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'
function mediaContentUrl(id: string) {
  return `${BASE_URL}/media/${id}/content`
}

import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Tag from 'primevue/tag'
import { useMediaStore } from '../stores/useMediaStore'

const store = useMediaStore()
const confirm = useConfirm()
const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => store.load())

function formatBytes(bytes: string | null): string {
  if (!bytes) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP')
}

function triggerUpload() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  try {
    await store.upload(file)
    toast.add({ severity: 'success', summary: 'アップロード完了', detail: file.name, life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'アップロード失敗', detail: String(e), life: 5000 })
  }
}

function confirmDelete(id: string, name: string) {
  confirm.require({
    message: `「${name}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '削除',
    rejectLabel: 'キャンセル',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await store.remove(id)
        toast.add({ severity: 'success', summary: '削除完了', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '削除失敗', detail: String(e), life: 5000 })
      }
    },
  })
}
</script>

<template>
  <div class="media-view">
    <div class="header">
      <h1>メディア管理</h1>
      <Button
        label="アップロード"
        icon="pi pi-upload"
        :loading="store.uploading"
        @click="triggerUpload"
      />
      <input
        ref="fileInput"
        type="file"
        accept="image/*,video/*"
        style="display: none"
        @change="onFileSelected"
      />
    </div>

    <DataTable
      :value="store.files"
      :loading="store.loading"
      stripedRows
      responsiveLayout="scroll"
    >
      <template #empty>メディアファイルがありません</template>

      <Column header="プレビュー" style="width: 6rem">
        <template #body="{ data }">
          <img
            v-if="data.type === 'IMAGE'"
            :src="mediaContentUrl(data.id)"
            :alt="data.originalName"
            style="width: 64px; height: 40px; object-fit: cover; border-radius: 4px"
          />
          <span v-else class="pi pi-video" style="font-size: 1.5rem; color: #6c757d" />
        </template>
      </Column>

      <Column field="originalName" header="ファイル名" />

      <Column header="種別" style="width: 6rem">
        <template #body="{ data }">
          <Tag
            :value="data.type"
            :severity="data.type === 'IMAGE' ? 'success' : 'info'"
          />
        </template>
      </Column>

      <Column header="サイズ" style="width: 8rem">
        <template #body="{ data }">{{ formatBytes(data.sizeBytes) }}</template>
      </Column>

      <Column header="アップロード日時" style="width: 12rem">
        <template #body="{ data }">{{ formatDate(data.uploadedAt) }}</template>
      </Column>

      <Column style="width: 5rem">
        <template #body="{ data }">
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            @click="confirmDelete(data.id, data.originalName)"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.media-view {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}
</style>
