<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Panel from 'primevue/panel'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import Toolbar from 'primevue/toolbar'
import { usePlaylistStore, type SavePlan } from '../stores/usePlaylistStore'
import { usePlaylistsStore } from '../stores/usePlaylistsStore'
import { useMediaStore } from '../stores/useMediaStore'
import type {
  PlaylistItem,
  PlaylistItemType,
  PlaylistMediaFile,
  CreatePlaylistItemBody,
  UpdatePlaylistItemBody,
} from '../api/playlist'
import type { MediaFile } from '../api/media'
import { setPageMeta } from '../composables/useTopbar'
import PageBreadcrumb from '../components/common/PageBreadcrumb.vue'
import StatusBadge from '../components/common/StatusBadge.vue'
import Thumb from '../components/common/Thumb.vue'
import DurationField from '../components/common/DurationField.vue'
import AddItemWizard from '../components/playlist/AddItemWizard.vue'

setPageMeta({ title: 'プレイリスト編集' })

const route = useRoute()
const router = useRouter()
const playlistStore = usePlaylistStore()
const playlistsStore = usePlaylistsStore()
const mediaStore = useMediaStore()
const confirm = useConfirm()
const toast = useToast()

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'
function mediaContentUrl(id: string): string {
  return `${BASE_URL}/media/${id}/content`
}

const playlistId = computed(() => route.params.id as string)
const playlistMeta = computed(() => playlistsStore.playlists.find((p) => p.id === playlistId.value))

const breadcrumbItems = computed(() => [
  { label: 'プレイリスト', route: '/playlists' },
  { label: playlistMeta.value?.name ?? 'プレイリスト' },
])

// --- Buffered edit state ---

type EditableItem = PlaylistItem & { _isNew?: boolean }

const localItems = ref<EditableItem[]>([])
const pendingCreates = ref<Map<string, CreatePlaylistItemBody>>(new Map())
const pendingPatches = ref<Map<string, UpdatePlaylistItemBody>>(new Map())
const initialized = ref(false)

let tempIdCounter = 0
function nextTempId(): string {
  tempIdCounter += 1
  return `__new_${Date.now()}_${tempIdCounter}`
}

function resetBuffer() {
  localItems.value = playlistStore.items.map((i) => ({ ...i }))
  pendingCreates.value = new Map()
  pendingPatches.value = new Map()
}

watch(
  () => playlistStore.items,
  () => {
    if (!isDirty.value) {
      localItems.value = playlistStore.items.map((i) => ({ ...i }))
    }
  },
)

const isDirty = computed(() => {
  if (pendingCreates.value.size > 0) return true
  if (pendingPatches.value.size > 0) return true
  const serverIds = playlistStore.items.map((i) => i.id)
  const localIds = localItems.value.map((i) => i.id)
  if (serverIds.length !== localIds.length) return true
  for (let i = 0; i < serverIds.length; i++) {
    if (serverIds[i] !== localIds[i]) return true
  }
  return false
})

onMounted(async () => {
  await Promise.all([
    playlistStore.load(playlistId.value),
    playlistsStore.load(),
    mediaStore.load(),
  ])
  resetBuffer()
  initialized.value = true
})

// --- beforeunload guard ---

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

onBeforeRouteLeave((_to, _from, next) => {
  if (!isDirty.value) {
    next()
    return
  }
  confirm.require({
    message: '未保存の変更があります。破棄して移動しますか？',
    header: '変更の破棄',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '破棄して移動', severity: 'danger' },
    accept: () => next(),
    reject: () => next(false),
  })
})

// --- Title rename (immediate save, unchanged) ---

const editingName = ref(false)
const draftName = ref('')
const nameInputRef = ref<{ $el: HTMLElement } | null>(null)

async function startEditName() {
  draftName.value = playlistMeta.value?.name ?? ''
  editingName.value = true
  await nextTick()
  const input = nameInputRef.value?.$el?.querySelector('input') as HTMLInputElement | null
  input?.focus()
  input?.select()
}

async function commitName() {
  const next = draftName.value.trim()
  editingName.value = false
  const current = playlistMeta.value?.name ?? ''
  if (!next || next === current) return
  try {
    await playlistsStore.rename(playlistId.value, next)
    toast.add({ severity: 'success', summary: '名前を更新しました', life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: '更新失敗', detail: String(e), life: 5000 })
  }
}

function cancelName() {
  editingName.value = false
}

// --- Buffered mutations ---

function onReorder(event: { value: EditableItem[] }) {
  localItems.value = event.value
}

function move(index: number, delta: number) {
  const j = index + delta
  if (j < 0 || j >= localItems.value.length) return
  const next = [...localItems.value]
  ;[next[index], next[j]] = [next[j], next[index]]
  localItems.value = next
}

function patchLocalItem(id: string, patch: Partial<EditableItem>) {
  const idx = localItems.value.findIndex((i) => i.id === id)
  if (idx === -1) return
  const next = [...localItems.value]
  next[idx] = { ...next[idx], ...patch }
  localItems.value = next
}

function onDurationChange(item: EditableItem, value: number) {
  patchLocalItem(item.id, { durationSec: value })
  if (item._isNew) {
    const body = pendingCreates.value.get(item.id)
    if (body && 'durationSec' in body) {
      pendingCreates.value.set(item.id, { ...body, durationSec: value } as CreatePlaylistItemBody)
    }
  } else {
    const prev = pendingPatches.value.get(item.id) ?? {}
    pendingPatches.value.set(item.id, { ...prev, durationSec: value })
  }
}

function onDurationReset(item: EditableItem) {
  if (item._isNew) {
    const fallback = defaultDurations[item.type]
    patchLocalItem(item.id, { durationSec: fallback })
    const body = pendingCreates.value.get(item.id)
    if (body && 'durationSec' in body) {
      pendingCreates.value.set(item.id, { ...body, durationSec: fallback } as CreatePlaylistItemBody)
    }
  } else {
    patchLocalItem(item.id, { durationSec: null })
    const prev = pendingPatches.value.get(item.id) ?? {}
    pendingPatches.value.set(item.id, { ...prev, durationSec: null })
  }
}

function onToggleFullscreen(item: EditableItem, value: boolean) {
  patchLocalItem(item.id, { isFullscreen: value })
  if (item._isNew) {
    const body = pendingCreates.value.get(item.id)
    if (body && (body.type === 'IMAGE' || body.type === 'VIDEO')) {
      pendingCreates.value.set(item.id, { ...body, isFullscreen: value })
    }
  } else {
    const prev = pendingPatches.value.get(item.id) ?? {}
    pendingPatches.value.set(item.id, { ...prev, isFullscreen: value })
  }
}

function confirmDelete(item: EditableItem, label: string) {
  confirm.require({
    message: `「${label}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '削除', severity: 'danger' },
    accept: () => {
      localItems.value = localItems.value.filter((i) => i.id !== item.id)
      if (item._isNew) {
        pendingCreates.value.delete(item.id)
      } else {
        pendingPatches.value.delete(item.id)
      }
    },
  })
}

// --- Save / discard ---

function buildSavePlan(): SavePlan {
  const localIdSet = new Set(localItems.value.map((i) => i.id))
  const deletes = playlistStore.items
    .filter((i) => !localIdSet.has(i.id))
    .map((i) => i.id)
  const patches = Array.from(pendingPatches.value.entries())
    .filter(([id]) => localIdSet.has(id))
    .map(([id, patch]) => ({ id, patch }))
  const creates = Array.from(pendingCreates.value.entries())
    .filter(([tempId]) => localIdSet.has(tempId))
    .map(([tempId, body]) => ({ tempId, body }))
  const finalOrder = localItems.value.map((i) => i.id)
  return { deletes, patches, creates, finalOrder }
}

async function saveAll() {
  if (!isDirty.value || playlistStore.saving) return
  try {
    await playlistStore.saveAll(playlistId.value, buildSavePlan())
    pendingCreates.value = new Map()
    pendingPatches.value = new Map()
    localItems.value = playlistStore.items.map((i) => ({ ...i }))
    toast.add({ severity: 'success', summary: '保存しました', life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: '保存失敗', detail: String(e), life: 5000 })
  }
}

function discardAll() {
  if (!isDirty.value) return
  confirm.require({
    message: '未保存の変更を破棄します。よろしいですか？',
    header: '変更の破棄',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '破棄', severity: 'danger' },
    accept: () => resetBuffer(),
  })
}

// --- Add wizard ---

const wizardOpen = ref(false)

function openWizard() {
  wizardOpen.value = true
}

function toPlaylistMediaFile(m: MediaFile): PlaylistMediaFile {
  return {
    id: m.id,
    url: m.url,
    mimeType: m.mimeType,
    originalName: m.originalName,
  }
}

function onWizardSubmit({ body, mediaFile }: { body: CreatePlaylistItemBody; mediaFile: MediaFile | null }) {
  const tempId = nextTempId()
  const order = localItems.value.length + 1
  const preview: EditableItem = body.type === 'IMAGE'
    ? {
        id: tempId,
        type: 'IMAGE',
        order,
        durationSec: body.durationSec,
        isFullscreen: body.isFullscreen ?? false,
        mediaFile: mediaFile ? toPlaylistMediaFile(mediaFile) : null,
        _isNew: true,
      }
    : body.type === 'VIDEO'
    ? {
        id: tempId,
        type: 'VIDEO',
        order,
        durationSec: null,
        isFullscreen: body.isFullscreen ?? false,
        mediaFile: mediaFile ? toPlaylistMediaFile(mediaFile) : null,
        _isNew: true,
      }
    : {
        id: tempId,
        type: body.type,
        order,
        durationSec: body.durationSec,
        isFullscreen: false,
        mediaFile: null,
        _isNew: true,
      }
  pendingCreates.value.set(tempId, body)
  localItems.value = [...localItems.value, preview]
}

// --- Helpers ---

const typeLabel: Record<PlaylistItemType, string> = {
  ARTICLE_LATEST: '最新記事',
  ARTICLE_RANDOM: 'ランダム記事',
  RANKING: 'ランキング',
  IMAGE: '画像',
  VIDEO: '動画',
}

const typeSeverity: Record<PlaylistItemType, 'success' | 'info' | 'warn' | 'secondary' | 'danger' | 'contrast'> = {
  ARTICLE_LATEST: 'info',
  ARTICLE_RANDOM: 'secondary',
  RANKING: 'warn',
  IMAGE: 'success',
  VIDEO: 'success',
}

const defaultDurations: Record<PlaylistItemType, number> = {
  ARTICLE_LATEST: 8,
  ARTICLE_RANDOM: 8,
  RANKING: 16,
  IMAGE: 8,
  VIDEO: 0,
}

function itemLabel(item: PlaylistItem): string {
  const base = typeLabel[item.type]
  if (item.mediaFile) return `${item.mediaFile.originalName}`
  return base
}

function itemThumbSrc(item: PlaylistItem): string | null {
  if (item.type === 'IMAGE' && item.mediaFile) return mediaContentUrl(item.mediaFile.id)
  return null
}

const totalDurationSec = computed(() =>
  localItems.value.reduce((sum, it) => sum + (it.durationSec ?? defaultDurations[it.type]), 0),
)

function formatDuration(sec: number): string {
  if (sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}秒`
  return `${m}分${s.toString().padStart(2, '0')}秒`
}
</script>

<template>
  <div class="playlist-view">
    <PageBreadcrumb :items="breadcrumbItems" />

    <!-- Top action bar -->
    <div class="flex align-items-center mb-3">
      <Button
        icon="pi pi-chevron-left"
        label="プレイリスト一覧"
        text
        severity="secondary"
        size="small"
        @click="router.push('/playlists')"
      />
    </div>

    <!-- Editor header -->
    <Panel class="mb-3" :pt="{ header: { class: 'hidden' },content: { class: 'p-3' } }">
      <div class="flex align-items-center gap-2">
        <InputText
          v-if="editingName"
          ref="nameInputRef"
          v-model="draftName"
          class="flex-1 title-input"
          @keydown.enter="commitName"
          @keydown.escape="cancelName"
          @blur="commitName"
        />
        <h2
          v-else
          class="m-0 flex-1 title"
          @click="startEditName"
        >
          {{ playlistMeta?.name ?? 'プレイリスト' }}
        </h2>
        <Button
          v-if="!editingName"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="名前を編集"
          @click="startEditName"
        />
        <StatusBadge v-if="playlistMeta?.isActive" tone="live" pulse>アクティブ</StatusBadge>
      </div>
      <div class="flex align-items-center gap-3 mt-2 text-xs text-color-secondary">
        <span>
          <strong class="tabular-nums" style="color: var(--p-text-color)">{{ localItems.length }}</strong>
          項目
        </span>
        <span>
          合計
          <strong class="tabular-nums" style="color: var(--p-text-color)">{{ formatDuration(totalDurationSec) }}</strong>
        </span>
      </div>
    </Panel>

    <Panel :pt="{ header: { class: 'hidden' }, content: { class: 'p-0' } }" class="overflow-hidden">
      <DataTable
        :value="localItems"
        :loading="playlistStore.loading"
        data-key="id"
        table-style="table-layout: fixed; width: 100%"
        :pt="{
          bodyCell: { style: { verticalAlign: 'middle', padding: '8px 12px' } },
        }"
        @row-reorder="onReorder"
      >
        <template #empty>
          <div class="text-center text-color-secondary py-4">
            プレイリストが空です。下の「アイテムを追加」から追加してください。
          </div>
        </template>

        <Column row-reorder style="width: 3rem" />

        <Column header="#" style="width: 3rem">
          <template #body="{ index }">
            <span class="tabular-nums text-color-secondary text-sm">
              {{ String(index + 1).padStart(2, '0') }}
            </span>
          </template>
        </Column>

        <Column style="width: 7rem">
          <template #body="{ data }: { data: EditableItem }">
            <Thumb
              :src="itemThumbSrc(data)"
              :alt="data.mediaFile?.originalName"
              :kind="data.type"
              :width="88"
              :height="58"
              :rounded="6"
            />
          </template>
        </Column>

        <Column header="内容">
          <template #body="{ data }: { data: EditableItem }">
            <div class="flex align-items-center gap-2">
              <Tag
                :value="typeLabel[data.type]"
                :severity="typeSeverity[data.type]"
                :pt="{ root: { class: 'white-space-nowrap' } }"
              />
              <span v-if="data.mediaFile" class="font-medium text-sm item-name">{{ data.mediaFile.originalName }}</span>
            </div>
          </template>
        </Column>

        <Column header="表示時間" style="width: 8rem">
          <template #body="{ data }: { data: EditableItem }">
            <DurationField
              v-if="data.type !== 'VIDEO'"
              :model-value="data.durationSec ?? defaultDurations[data.type]"
              :default-value="defaultDurations[data.type]"
              :is-custom="data.durationSec !== null && data.durationSec !== defaultDurations[data.type]"
              @update:model-value="onDurationChange(data, $event)"
              @reset="onDurationReset(data)"
            />
            <DurationField
              v-else
              :model-value="0"
              disabled
              display-label="フル再生"
            />
          </template>
        </Column>

        <Column header="全画面" style="width: 5.5rem">
          <template #body="{ data }: { data: EditableItem }">
            <ToggleSwitch
              v-if="data.type === 'IMAGE' || data.type === 'VIDEO'"
              :model-value="data.isFullscreen"
              @update:model-value="onToggleFullscreen(data, $event)"
            />
            <span v-else class="text-color-secondary text-sm">—</span>
          </template>
        </Column>

        <Column style="width: 8rem">
          <template #body="{ data, index }: { data: EditableItem, index: number }">
            <div class="flex gap-1">
              <Button
                icon="pi pi-arrow-up"
                text
                rounded
                size="small"
                severity="secondary"
                :disabled="index === 0"
                aria-label="上へ"
                @click="move(index, -1)"
              />
              <Button
                icon="pi pi-arrow-down"
                text
                rounded
                size="small"
                severity="secondary"
                :disabled="index === localItems.length - 1"
                aria-label="下へ"
                @click="move(index, 1)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                aria-label="削除"
                @click="confirmDelete(data, itemLabel(data))"
              />
            </div>
          </template>
        </Column>
      </DataTable>

      <div class="add-item-row">
        <Button
          label="アイテムを追加"
          icon="pi pi-plus"
          severity="primary"
          class="add-item-button"
          @click="openWizard"
        />
      </div>
    </Panel>

    <AddItemWizard v-model:visible="wizardOpen" @submit="onWizardSubmit" />

    <!-- Fixed bottom dirty toolbar -->
    <Transition name="dirty-bar">
      <Toolbar
        v-if="initialized && isDirty"
        :pt="{
          root: { class: 'dirty-bar' },
          start: { class: 'flex align-items-center gap-2 dirty-bar__msg' },
          end: { class: 'flex align-items-center gap-2' },
        }"
      >
        <template #start>
          <i class="pi pi-exclamation-circle" />
          <span>未保存の変更があります</span>
        </template>
        <template #end>
          <Button
            label="変更を破棄"
            severity="secondary"
            text
            size="small"
            :disabled="playlistStore.saving"
            @click="discardAll"
          />
          <Button
            label="保存"
            icon="pi pi-save"
            size="small"
            :loading="playlistStore.saving"
            @click="saveAll"
          />
        </template>
      </Toolbar>
    </Transition>
  </div>
</template>

<style scoped>
.title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: text;
}

.title-input {
  font-weight: 600;
}

.item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.add-item-row {
  padding: 12px 16px;
  border-top: 1px solid var(--p-content-border-color);
}

.add-item-button {
  width: 100%;
  border-style: dashed;
}

:deep(.dirty-bar) {
  position: sticky;
  bottom: 0.5rem;
  z-index: 5;
  margin-top: 1rem;
  background: var(--p-text-color);
  color: var(--p-content-background);
  border: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

:deep(.dirty-bar .p-button) {
  color: var(--p-content-background);
}

.dirty-bar__msg {
  font-weight: 500;
}

.dirty-bar-enter-active,
.dirty-bar-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.dirty-bar-enter-from,
.dirty-bar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
