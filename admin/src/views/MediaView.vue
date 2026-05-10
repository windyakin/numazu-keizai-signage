<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import DataView from 'primevue/dataview'
import FileUpload from 'primevue/fileupload'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Panel from 'primevue/panel'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Toolbar from 'primevue/toolbar'
import { useMediaStore } from '../stores/useMediaStore'
import { setPageMeta } from '../composables/useTopbar'
import PageBreadcrumb from '../components/common/PageBreadcrumb.vue'
import PageHeader from '../components/common/PageHeader.vue'
import Thumb from '../components/common/Thumb.vue'
import MediaPreview from '../components/common/MediaPreview.vue'
import type { MediaFile } from '../api/media'
import { formatBytes } from '../utils/format'

setPageMeta({ title: 'メディアライブラリ' })

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'
function mediaContentUrl(id: string): string {
  return `${BASE_URL}/media/${id}/content`
}

const store = useMediaStore()
const confirm = useConfirm()
const toast = useToast()

const search = ref('')
const filter = ref<'all' | 'IMAGE' | 'VIDEO'>('all')
const layout = ref<'grid' | 'list'>(
  (localStorage.getItem('admin.media.layout') as 'grid' | 'list') || 'grid',
)
const selectedIds = ref<Set<string>>(new Set())

const previewVisible = ref(false)
const previewMedia = ref<MediaFile | null>(null)

function openPreview(media: MediaFile) {
  previewMedia.value = media
  previewVisible.value = true
}

const filterOptions = [
  { label: 'すべて', value: 'all' as const },
  { label: '動画', value: 'VIDEO' as const },
  { label: '画像', value: 'IMAGE' as const },
]

const layoutOptions: ('grid' | 'list')[] = ['grid', 'list']

function setLayout(value: 'grid' | 'list') {
  layout.value = value
  localStorage.setItem('admin.media.layout', value)
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    store.setFilters({ q: v })
  }, 300)
})

watch(filter, (v) => {
  store.setFilters({ type: v === 'all' ? null : v })
})

const selectedCount = computed(() => selectedIds.value.size)

function toggleSelect(media: MediaFile) {
  if (media.playlistItemCount > 0) return
  const next = new Set(selectedIds.value)
  if (next.has(media.id)) next.delete(media.id)
  else next.add(media.id)
  selectedIds.value = next
}

function onCardClick(media: MediaFile) {
  if (selectedCount.value > 0) toggleSelect(media)
}

function onThumbClick(media: MediaFile) {
  if (selectedCount.value > 0) toggleSelect(media)
  else openPreview(media)
}

function clearSelection() {
  selectedIds.value = new Set()
}

onMounted(() => store.load())

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

type UploadStatus = 'uploading' | 'failed'
type UploadEntry = {
  id: string
  name: string
  size: number
  status: UploadStatus
  error?: string
}

type ListItem =
  | { kind: 'upload'; id: string; entry: UploadEntry }
  | { kind: 'media'; id: string; media: MediaFile }

const fileUploadRef = ref<{
  $el?: HTMLElement
  clear?: () => void
} | null>(null)
const uploadEntries = ref<UploadEntry[]>([])
const recentlyUploadedIds = ref<Set<string>>(new Set())

const listItems = computed<ListItem[]>(() => [
  ...uploadEntries.value.map<ListItem>((entry) => ({
    kind: 'upload',
    id: `upload:${entry.id}`,
    entry,
  })),
  ...store.files.map<ListItem>((media) => ({
    kind: 'media',
    id: `media:${media.id}`,
    media,
  })),
])

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        store.loadMore()
      }
    },
    { rootMargin: '300px' },
  )
})

watch(sentinel, (el, prev) => {
  if (prev) observer?.unobserve(prev)
  if (el) observer?.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (searchTimer) clearTimeout(searchTimer)
})

function openPicker() {
  const input = fileUploadRef.value?.$el?.querySelector<HTMLInputElement>(
    'input[type="file"]',
  )
  input?.click()
}

function dismissUpload(id: string) {
  uploadEntries.value = uploadEntries.value.filter((e) => e.id !== id)
}

async function onUploader(event: { files: File[] | File }) {
  const raw = Array.isArray(event.files) ? event.files : [event.files]
  const accepted = raw.filter(
    (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
  )
  const skipped = raw.length - accepted.length
  if (skipped > 0) {
    toast.add({
      severity: 'warn',
      summary: '対応していないファイルをスキップしました',
      detail: `${skipped} 件 (画像 / 動画のみ対応)`,
      life: 4000,
    })
  }
  // PrimeVue は customUpload でも内部 files を保持するので毎回クリアして
  // 次回 D&D の累積アップロードと UI の残留を防ぐ
  fileUploadRef.value?.clear?.()
  if (accepted.length === 0) return

  const queued = accepted.map((file) => ({
    id: crypto.randomUUID(),
    file,
  }))
  uploadEntries.value = [
    ...queued.map(({ id, file }) => ({
      id,
      name: file.name,
      size: file.size,
      status: 'uploading' as UploadStatus,
    })),
    ...uploadEntries.value,
  ]

  // 即時に完了しても進行が分かるように、最低限ローディングを見せる時間
  const minVisibleMs = 1000
  for (const { id, file } of queued) {
    const minDelay = new Promise<void>((r) => setTimeout(r, minVisibleMs))
    try {
      const [registered] = await Promise.all([store.uploadOne(file), minDelay])
      store.prependFile(registered)
      recentlyUploadedIds.value.add(registered.id)
      uploadEntries.value = uploadEntries.value.filter((e) => e.id !== id)
    } catch (e) {
      await minDelay
      const entry = uploadEntries.value.find((e) => e.id === id)
      if (entry) {
        entry.status = 'failed'
        entry.error = String(e)
      }
    }
  }
}

function confirmDeleteSingle(id: string, name: string) {
  confirm.require({
    message: `「${name}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '削除', severity: 'danger' },
    accept: async () => {
      try {
        await store.remove(id)
        const next = new Set(selectedIds.value)
        next.delete(id)
        selectedIds.value = next
        toast.add({ severity: 'success', summary: '削除完了', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '削除失敗', detail: String(e), life: 5000 })
      }
    },
  })
}

function confirmDeleteSelected() {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return
  confirm.require({
    message: `${ids.length}件のメディアを削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '削除', severity: 'danger' },
    accept: async () => {
      let success = 0
      const errors: string[] = []
      for (const id of ids) {
        try {
          await store.remove(id)
          success++
        } catch (e) {
          errors.push(String(e))
        }
      }
      clearSelection()
      if (success > 0) {
        toast.add({ severity: 'success', summary: `${success}件削除しました`, life: 2000 })
      }
      for (const err of errors) {
        toast.add({ severity: 'error', summary: '削除失敗', detail: err, life: 5000 })
      }
    },
  })
}
</script>

<template>
  <div class="media-view">
    <PageBreadcrumb :items="[{ label: 'メディアライブラリ' }]" />
    <PageHeader title="メディアライブラリ" description="画像・動画をアップロードしてプレイリストで使用できます" />

    <!-- Upload zone -->
    <div class="mb-3">
      <FileUpload
        ref="fileUploadRef"
        mode="advanced"
        custom-upload
        :auto="true"
        :multiple="true"
        accept="image/*,video/*"
        :pt="{
          header: { class: 'hidden' },
          content: { class: 'p-2' },
          file: { class: 'hidden' },
          pcProgressBar: { class: 'hidden' },
          pcMessage: { class: 'hidden' },
        }"
        @uploader="onUploader"
      >
        <template #empty>
          <div class="dropzone" @click="openPicker">
            <i class="pi pi-upload text-2xl mb-3" />
            <div class="text-sm">ファイルをドラッグ＆ドロップ、またはクリックして選択</div>
          </div>
        </template>
      </FileUpload>
    </div>

    <!-- Toolbar -->
    <div class="toolbar mb-3">
      <IconField icon-position="left" class="search">
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" placeholder="メディアを検索…" class="w-full" />
      </IconField>
      <SelectButton
        v-model="filter"
        :options="filterOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
      />
      <div class="flex-grow-1" />
      <SelectButton
        :model-value="layout"
        :options="layoutOptions"
        :allow-empty="false"
        @update:model-value="setLayout"
      >
        <template #option="{ option }">
          <i :class="option === 'grid' ? 'pi pi-th-large' : 'pi pi-bars'" />
        </template>
      </SelectButton>
    </div>

    <!-- Bulk action bar -->
    <Toolbar
      v-if="selectedCount > 0"
      class="mb-3"
      :pt="{
        root: { class: 'bulk' },
        start: { class: 'flex align-items-center gap-2 text-sm' },
        end: { class: 'flex align-items-center gap-2' },
      }"
    >
      <template #start>
        <i class="pi pi-check" />
        <span><strong class="tabular-nums">{{ selectedCount }}</strong> 件選択中</span>
      </template>
      <template #end>
        <Button
          label="削除"
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          @click="confirmDeleteSelected"
        />
        <Button
          icon="pi pi-times"
          text
          rounded
          severity="secondary"
          size="small"
          aria-label="選択解除"
          @click="clearSelection"
        />
      </template>
    </Toolbar>

    <!-- DataView -->
    <Panel :pt="{ header: { class:'hidden' }, content: { class: 'p-3' }}">
      <DataView
        :value="listItems"
        :layout="layout"
        data-key="id"
        :empty-message="'メディアがありません'"
      >
        <template #empty>
          <div class="text-center text-color-secondary py-5">メディアがありません</div>
        </template>

        <template #grid="{ items }">
          <div :class="['card-grid', { 'card-grid--selecting': selectedCount > 0 }]">
            <template v-for="item in (items as ListItem[])" :key="item.id">
              <!-- Uploading / failed placeholder -->
              <div
                v-if="item.kind === 'upload'"
                :class="['card card--upload', { 'card--failed': item.entry.status === 'failed' }]"
              >
                <div class="thumb thumb--placeholder">
                  <div class="upload-overlay">
                    <i
                      v-if="item.entry.status === 'uploading'"
                      class="pi pi-spin pi-spinner text-2xl"
                    />
                    <i v-else class="pi pi-exclamation-triangle text-2xl" />
                  </div>
                </div>
                <div class="meta">
                  <div class="name" :title="item.entry.name">{{ item.entry.name }}</div>
                  <div class="flex gap-2 align-items-center justify-content-between">
                    <span
                      v-if="item.entry.status === 'uploading'"
                      class="text-xs text-color-secondary"
                    >
                      アップロード中…
                    </span>
                    <span v-else class="text-xs text-red-500" :title="item.entry.error">
                      アップロード失敗
                    </span>
                    <Button
                      v-if="item.entry.status === 'failed'"
                      icon="pi pi-times"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="閉じる"
                      @click.stop="dismissUpload(item.entry.id)"
                    />
                  </div>
                </div>
              </div>

              <!-- Real media item -->
              <div
                v-else
                :class="['card', {
                  'card--selected': selectedIds.has(item.media.id),
                  'card--new': recentlyUploadedIds.has(item.media.id),
                  'card--locked': item.media.playlistItemCount > 0,
                }]"
                @click="onCardClick(item.media)"
              >
                <div class="thumb" @click.stop="onThumbClick(item.media)">
                  <Thumb
                    :src="item.media.type === 'IMAGE' ? mediaContentUrl(item.media.id) : null"
                    :alt="item.media.originalName"
                    :kind="item.media.type"
                    width="100%"
                    :height="120"
                    :rounded="10"
                  />
                  <span
                    v-tooltip.top="item.media.playlistItemCount > 0 ? 'プレイリストで使用中のため選択できません' : ''"
                    class="card-check"
                  >
                    <Checkbox
                      :model-value="selectedIds.has(item.media.id)"
                      binary
                      :disabled="item.media.playlistItemCount > 0"
                      aria-label="選択"
                      @click.stop
                      @update:model-value="toggleSelect(item.media)"
                    />
                  </span>
                  <Tag
                    v-if="recentlyUploadedIds.has(item.media.id)"
                    value="NEW"
                    severity="success"
                    class="new-badge"
                  />
                  <span v-if="selectedCount === 0" class="thumb-overlay">
                    <i class="pi pi-eye" />
                  </span>
                </div>
                <div class="meta">
                  <div class="name" :title="item.media.originalName">{{ item.media.originalName }}</div>
                  <div class="flex gap-2 align-items-center flex-wrap">
                    <Tag
                      :value="item.media.type === 'IMAGE' ? '画像' : '動画'"
                      :severity="item.media.type === 'IMAGE' ? 'success' : 'info'"
                    />
                    <span
                      v-if="item.media.playlistItemCount > 0"
                      v-tooltip.top="`${item.media.playlistItemCount} 件のプレイリストで使用中`"
                      class="usage-badge"
                    >
                      <i class="pi pi-list" />
                      <span class="tabular-nums">{{ item.media.playlistItemCount }}</span>
                    </span>
                    <span class="text-xs text-color-secondary tabular-nums ml-auto">{{ formatBytes(item.media.sizeBytes) }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>

        <template #list="{ items }">
          <div class="list">
            <template v-for="item in (items as ListItem[])" :key="item.id">
              <!-- Uploading / failed placeholder -->
              <div
                v-if="item.kind === 'upload'"
                :class="['row row--upload', { 'row--failed': item.entry.status === 'failed' }]"
              >
                <i
                  v-if="item.entry.status === 'uploading'"
                  class="pi pi-spin pi-spinner text-color-secondary"
                />
                <i v-else class="pi pi-exclamation-triangle text-red-500" />
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm name">{{ item.entry.name }}</div>
                  <div
                    v-if="item.entry.status === 'uploading'"
                    class="text-xs text-color-secondary"
                  >
                    アップロード中…
                  </div>
                  <div v-else class="text-xs text-red-500" :title="item.entry.error">
                    アップロード失敗
                  </div>
                </div>
                <span class="text-sm text-color-secondary tabular-nums size">{{ formatBytes(item.entry.size) }}</span>
                <Button
                  v-if="item.entry.status === 'failed'"
                  icon="pi pi-times"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  aria-label="閉じる"
                  @click.stop="dismissUpload(item.entry.id)"
                />
              </div>

              <!-- Real media item -->
              <div
                v-else
                :class="['row', {
                  'row--selected': selectedIds.has(item.media.id),
                  'row--new': recentlyUploadedIds.has(item.media.id),
                  'row--locked': item.media.playlistItemCount > 0,
                }]"
                @click="toggleSelect(item.media)"
              >
                <span
                  v-tooltip.right="item.media.playlistItemCount > 0 ? 'プレイリストで使用中のため選択できません' : ''"
                >
                  <Checkbox
                    :model-value="selectedIds.has(item.media.id)"
                    binary
                    :disabled="item.media.playlistItemCount > 0"
                    aria-label="選択"
                    @click.stop
                    @update:model-value="toggleSelect(item.media)"
                  />
                </span>
                <div class="row-thumb" @click.stop="openPreview(item.media)">
                  <Thumb
                    :src="item.media.type === 'IMAGE' ? mediaContentUrl(item.media.id) : null"
                    :alt="item.media.originalName"
                    :kind="item.media.type"
                    :width="80"
                    :height="53"
                    :rounded="5"
                  />
                  <span class="thumb-overlay thumb-overlay--sm">
                    <i class="pi pi-eye" />
                  </span>
                </div>
                <Tag
                  :value="item.media.type === 'IMAGE' ? '画像' : '動画'"
                  :severity="item.media.type === 'IMAGE' ? 'success' : 'info'"
                />
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm name">{{ item.media.originalName }}</div>
                  <div class="text-xs text-color-secondary">
                    {{ formatDate(item.media.uploadedAt) }}
                    <span class="mx-1">·</span>
                    <span class="tabular-nums">{{ formatBytes(item.media.sizeBytes) }}</span>
                  </div>
                </div>
                <Tag
                  v-if="recentlyUploadedIds.has(item.media.id)"
                  value="NEW"
                  severity="success"
                />
                <span
                  v-if="item.media.playlistItemCount > 0"
                  v-tooltip.top="`${item.media.playlistItemCount} 件のプレイリストで使用中`"
                  class="usage-badge"
                >
                  <i class="pi pi-list" />
                  <span class="tabular-nums">{{ item.media.playlistItemCount }}</span>
                </span>
                <span
                  v-tooltip.left="item.media.playlistItemCount > 0 ? 'プレイリストで使用中のため削除できません' : ''"
                >
                  <Button
                    icon="pi pi-trash"
                    severity="danger"
                    text
                    rounded
                    size="small"
                    :disabled="item.media.playlistItemCount > 0"
                    aria-label="削除"
                    @click.stop="confirmDeleteSingle(item.media.id, item.media.originalName)"
                  />
                </span>
              </div>
            </template>
          </div>
        </template>
      </DataView>

      <div ref="sentinel" class="sentinel" />
      <div v-if="store.loadingMore" class="loading-more">
        <i class="pi pi-spin pi-spinner" />
        <span class="text-sm text-color-secondary">読み込み中…</span>
      </div>
    </Panel>

    <MediaPreview v-model:visible="previewVisible" :media="previewMedia" />
  </div>
</template>

<style scoped>
.filename {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search {
  flex: 1 1 220px;
  max-width: 340px;
}

.sentinel {
  height: 1px;
}

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 24px;
  color: var(--p-text-muted-color);
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 120ms, color 120ms;
}

.dropzone:hover {
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.card--upload {
  cursor: default;
  opacity: 0.85;
}

.card--failed .upload-overlay {
  background: var(--p-red-50, rgba(239, 68, 68, 0.08));
  color: var(--p-red-500, #ef4444);
}

.thumb--placeholder {
  height: 120px;
  border-radius: 10px;
  background: var(--p-content-hover-background);
  display: grid;
  place-items: center;
}

.upload-overlay {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--p-text-muted-color);
}

.row--upload {
  cursor: default;
}

.row--failed {
  background: var(--p-red-50, rgba(239, 68, 68, 0.06));
}

:deep(.bulk) {
  position: sticky;
  top: 0.5rem;
  z-index: 5;
  background: var(--p-text-color);
  color: var(--p-content-background);
  border: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

:deep(.bulk .p-button) {
  color: var(--p-content-background);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.card {
  border-radius: 10px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 120ms;
}

.card--selected {
  outline-color: var(--p-primary-color);
}

.thumb {
  position: relative;
  cursor: zoom-in;
}

.card-grid--selecting .card,
.card-grid--selecting .thumb {
  cursor: pointer;
}

.card-grid--selecting .card--locked,
.card-grid--selecting .card--locked .thumb {
  cursor: not-allowed;
}

.row--locked {
  cursor: not-allowed;
}

.thumb-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 16px;
  opacity: 0;
  transition: opacity 120ms;
  pointer-events: none;
}

.thumb-overlay--sm {
  width: 26px;
  height: 26px;
  font-size: 12px;
}

.thumb:hover .thumb-overlay,
.row-thumb:hover .thumb-overlay {
  opacity: 1;
}

.card-check {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
  opacity: 0;
  transition: opacity 120ms;
}

.card:hover .card-check,
.card-check:focus-within,
.card-grid--selecting .card-check {
  opacity: 1;
}

.new-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
}

.usage-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--p-text-muted-color);
}

.meta {
  padding: 10px 4px 4px;
}

.name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
  font-weight: 500;
  margin-bottom: 4px;
}

.list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--p-content-background);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--p-content-border-color);
  cursor: pointer;
}

.row:first-child {
  border-top: 0;
}

.row--selected {
  background: var(--p-highlight-background);
}

.row-thumb {
  position: relative;
  display: inline-flex;
  cursor: zoom-in;
}

.size {
  width: 80px;
  text-align: right;
}
</style>
