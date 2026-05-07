<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useMediaStore } from '../stores/useMediaStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'
function mediaContentUrl(id: string) {
  return `${BASE_URL}/media/${id}/content`
}

const store = useMediaStore()
const confirm = useConfirm()
const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
let dragCounter = 0

onMounted(() => {
  store.load()
  window.addEventListener('dragenter', onWindowDragEnter)
  window.addEventListener('dragleave', onWindowDragLeave)
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('drop', onWindowDrop)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onWindowDragEnter)
  window.removeEventListener('dragleave', onWindowDragLeave)
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('drop', onWindowDrop)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!store.uploading) return
  event.preventDefault()
}

function hasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true
  }
  return false
}

function onWindowDragEnter(event: DragEvent) {
  if (!hasFiles(event) || store.uploading) return
  dragCounter++
  isDragging.value = true
}

function onWindowDragLeave(event: DragEvent) {
  if (!hasFiles(event)) return
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDragging.value = false
  }
}

function onWindowDragOver(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = store.uploading ? 'none' : 'copy'
  }
}

async function onWindowDrop(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragCounter = 0
  isDragging.value = false
  if (store.uploading) return
  const dropped = Array.from(event.dataTransfer?.files ?? [])
  await uploadFiles(dropped)
}

async function uploadFiles(rawFiles: File[]) {
  if (store.uploading || rawFiles.length === 0) return
  const accepted = rawFiles.filter(
    (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
  )
  const skipped = rawFiles.length - accepted.length
  if (skipped > 0) {
    toast.add({
      severity: 'warn',
      summary: '対応していないファイルをスキップしました',
      detail: `${skipped} 件 (画像 / 動画のみ対応)`,
      life: 4000,
    })
  }
  if (accepted.length === 0) return
  const { uploaded, failed } = await store.uploadAll(accepted)
  if (uploaded > 0) {
    toast.add({
      severity: 'success',
      summary: 'アップロード完了',
      detail: `${uploaded} 件`,
      life: 3000,
    })
  }
  for (const f of failed) {
    toast.add({
      severity: 'error',
      summary: 'アップロード失敗',
      detail: `${f.file.name}: ${String(f.error)}`,
      life: 5000,
    })
  }
}

function triggerUpload() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  input.value = ''
  await uploadFiles(selected)
}

function formatBytes(bytes: string | number | null): string {
  if (bytes === null) return '—'
  const n = typeof bytes === 'number' ? bytes : Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP')
}

const fileProgressPercent = computed(() => {
  if (store.uploadFileSize === 0) return 0
  return Math.floor((store.uploadLoaded / store.uploadFileSize) * 100)
})

function confirmDelete(id: string, name: string) {
  confirm.require({
    message: `「${name}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '削除', severity: 'danger' },
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
    <div class="flex align-items-center gap-3 mb-4">
      <h1 class="m-0 text-xl">メディア管理</h1>
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
        multiple
        class="hidden"
        @change="onFileSelected"
      />
      <span class="text-sm text-color-secondary ml-auto">
        <span class="pi pi-info-circle mr-1" />
        ファイルをドラッグ＆ドロップでもアップロードできます
      </span>
    </div>

    <DataTable
      :value="store.files"
      :loading="store.loading"
      stripedRows
    >
      <template #empty>メディアファイルがありません</template>

      <Column header="プレビュー" style="width: 6rem">
        <template #body="{ data }">
          <img
            v-if="data.type === 'IMAGE'"
            :src="mediaContentUrl(data.id)"
            :alt="data.originalName"
            class="border-round thumbnail"
          />
          <span v-else class="pi pi-video text-2xl text-color-secondary" />
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

      <Column header="使用状況" style="width: 8rem">
        <template #body="{ data }">
          <Tag
            v-if="data.playlistItemCount > 0"
            :value="`使用中 (${data.playlistItemCount})`"
            severity="warn"
          />
          <span v-else class="text-color-secondary text-sm">未使用</span>
        </template>
      </Column>

      <Column style="width: 5rem">
        <template #body="{ data }">
          <span
            v-tooltip.left="data.playlistItemCount > 0 ? 'プレイリストで使用中のため削除できません' : ''"
          >
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :disabled="data.playlistItemCount > 0"
              @click="confirmDelete(data.id, data.originalName)"
            />
          </span>
        </template>
      </Column>
    </DataTable>

    <Teleport to="body">
      <div v-if="isDragging && !store.uploading" class="drop-overlay">
        <div class="drop-message text-center">
          <span class="pi pi-upload" style="font-size: 4rem" />
          <div class="text-2xl mt-3 font-semibold">ファイルをドロップしてアップロード</div>
          <div class="text-sm mt-2 text-color-secondary">画像 / 動画のみ対応</div>
        </div>
      </div>
    </Teleport>

    <Dialog
      :visible="store.uploading"
      modal
      :closable="false"
      :draggable="false"
      :dismissable-mask="false"
      :close-on-escape="false"
      :show-header="false"
      style="width: 28rem; max-width: 90vw"
    >
      <div class="flex flex-column gap-3 py-3">
        <div class="flex justify-content-between align-items-center">
          <span class="font-semibold">アップロード中…</span>
          <span class="text-sm text-color-secondary">
            {{ store.uploadIndex + 1 }} / {{ store.uploadTotal }}
          </span>
        </div>
        <div class="text-sm filename" :title="store.uploadFileName">
          {{ store.uploadFileName }}
        </div>
        <ProgressBar :value="fileProgressPercent" />
        <div class="text-xs text-color-secondary text-right">
          {{ formatBytes(store.uploadLoaded) }} / {{ formatBytes(store.uploadFileSize) }}
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.thumbnail {
  width: 48px;
  height: 48px;
  object-fit: cover;
}

.filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2000;
  color: #fff;
}

.drop-message {
  border: 3px dashed #fff;
  border-radius: 1rem;
  padding: 3rem 4rem;
  background: rgba(0, 0, 0, 0.25);
}
</style>
