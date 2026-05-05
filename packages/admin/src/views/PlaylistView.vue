<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { usePlaylistStore } from '../stores/usePlaylistStore'
import { useMediaStore } from '../stores/useMediaStore'
import type { PlaylistItemType, CreatePlaylistItemBody } from '../api/playlist'
import type { MediaFile } from '../api/media'

const route = useRoute()
const router = useRouter()
const playlistStore = usePlaylistStore()
const mediaStore = useMediaStore()
const confirm = useConfirm()
const toast = useToast()

const playlistId = computed(() => route.params.id as string)

// ローカルコピー（ドラッグ並び替え用）
const localItems = ref([...playlistStore.items])
const isDirty = computed(() => {
  const storeIds = playlistStore.items.map((i) => i.id).join(',')
  const localIds = localItems.value.map((i) => i.id).join(',')
  return storeIds !== localIds
})

watch(
  () => playlistStore.items,
  (items) => {
    localItems.value = [...items]
  },
)

onMounted(async () => {
  await Promise.all([playlistStore.load(playlistId.value), mediaStore.load()])
})

// 並び替え保存
async function saveOrder() {
  try {
    await playlistStore.reorder(playlistId.value, localItems.value.map((i) => i.id))
    toast.add({ severity: 'success', summary: '順序を保存しました', life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: '保存失敗', detail: String(e), life: 5000 })
  }
}

function onReorder(event: { value: typeof localItems.value }) {
  localItems.value = event.value
}

// 削除
function confirmDelete(id: string, label: string) {
  confirm.require({
    message: `「${label}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '削除',
    rejectLabel: 'キャンセル',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await playlistStore.remove(playlistId.value, id)
        toast.add({ severity: 'success', summary: '削除しました', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '削除失敗', detail: String(e), life: 5000 })
      }
    },
  })
}

// アイテム追加ダイアログ
const showDialog = ref(false)
const newType = ref<PlaylistItemType>('ARTICLE_LATEST')
const newDuration = ref<number>(8)
const newMediaFileId = ref<string | null>(null)
const newIsFullscreen = ref(false)

const typeOptions: { label: string; value: PlaylistItemType }[] = [
  { label: '最新記事', value: 'ARTICLE_LATEST' },
  { label: 'ランダム記事', value: 'ARTICLE_RANDOM' },
  { label: 'アクセスランキング', value: 'RANKING' },
  { label: '画像', value: 'IMAGE' },
  { label: '動画', value: 'VIDEO' },
]

const needsMedia = computed(() => newType.value === 'IMAGE' || newType.value === 'VIDEO')
const isVideo = computed(() => newType.value === 'VIDEO')

const mediaOptions = computed<{ label: string; value: string }[]>(() => {
  const targetType: MediaFile['type'] = newType.value === 'IMAGE' ? 'IMAGE' : 'VIDEO'
  return mediaStore.files
    .filter((f) => f.type === targetType)
    .map((f) => ({ label: f.originalName, value: f.id }))
})

function openDialog() {
  newType.value = 'ARTICLE_LATEST'
  newDuration.value = 8
  newMediaFileId.value = null
  newIsFullscreen.value = false
  showDialog.value = true
}

watch(newType, () => {
  newMediaFileId.value = null
  if (newType.value === 'VIDEO') newDuration.value = 0
  else newDuration.value = 8
})

async function confirmAdd() {
  if (needsMedia.value && !newMediaFileId.value) {
    toast.add({ severity: 'warn', summary: 'メディアを選択してください', life: 3000 })
    return
  }

  let body: CreatePlaylistItemBody
  if (newType.value === 'IMAGE') {
    body = {
      type: 'IMAGE',
      durationSec: newDuration.value,
      mediaFileId: newMediaFileId.value!,
      isFullscreen: newIsFullscreen.value,
    }
  } else if (newType.value === 'VIDEO') {
    body = {
      type: 'VIDEO',
      mediaFileId: newMediaFileId.value!,
      isFullscreen: newIsFullscreen.value,
    }
  } else {
    body = { type: newType.value, durationSec: newDuration.value }
  }

  try {
    await playlistStore.add(playlistId.value, body)
    showDialog.value = false
    toast.add({ severity: 'success', summary: 'アイテムを追加しました', life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: '追加失敗', detail: String(e), life: 5000 })
  }
}

async function onToggleFullscreen(item: (typeof localItems.value)[0], value: boolean) {
  try {
    await playlistStore.update(playlistId.value, item.id, { isFullscreen: value })
  } catch (e) {
    toast.add({ severity: 'error', summary: '更新失敗', detail: String(e), life: 5000 })
  }
}

// 表示ユーティリティ
const typeLabel: Record<PlaylistItemType, string> = {
  ARTICLE_LATEST: '最新記事',
  ARTICLE_RANDOM: 'ランダム記事',
  RANKING: 'ランキング',
  IMAGE: '画像',
  VIDEO: '動画',
}

const typeSeverity: Record<PlaylistItemType, string> = {
  ARTICLE_LATEST: 'info',
  ARTICLE_RANDOM: 'secondary',
  RANKING: 'warn',
  IMAGE: 'success',
  VIDEO: 'success',
}

function itemLabel(item: (typeof localItems.value)[0]): string {
  const base = typeLabel[item.type]
  if (item.mediaFile) return `${base}：${item.mediaFile.originalName}`
  return base
}

function durationLabel(item: (typeof localItems.value)[0]): string {
  if (item.type === 'VIDEO') return '自然終了'
  return item.durationSec != null ? `${item.durationSec}秒` : '—'
}
</script>

<template>
  <div class="playlist-view">
    <div class="header">
      <div class="header-left">
        <Button
          icon="pi pi-arrow-left"
          text
          size="small"
          @click="router.push('/playlists')"
        />
        <h1>プレイリスト編集</h1>
      </div>
      <div class="header-actions">
        <Button
          label="順序を保存"
          icon="pi pi-save"
          :disabled="!isDirty"
          @click="saveOrder"
        />
        <Button
          label="アイテムを追加"
          icon="pi pi-plus"
          @click="openDialog"
        />
      </div>
    </div>

    <DataTable
      :value="localItems"
      :loading="playlistStore.loading"
      reorderableRows
      stripedRows
      responsiveLayout="scroll"
      @row-reorder="onReorder"
    >
      <template #empty>プレイリストが空です。アイテムを追加してください。</template>

      <Column rowReorder style="width: 3rem" />

      <Column header="#" style="width: 3rem">
        <template #body="{ index }">{{ index + 1 }}</template>
      </Column>

      <Column header="種別" style="width: 10rem">
        <template #body="{ data }">
          <Tag :value="typeLabel[data.type]" :severity="typeSeverity[data.type]" />
        </template>
      </Column>

      <Column header="内容">
        <template #body="{ data }">{{ itemLabel(data) }}</template>
      </Column>

      <Column header="表示時間" style="width: 8rem">
        <template #body="{ data }">{{ durationLabel(data) }}</template>
      </Column>

      <Column header="フルスクリーン" style="width: 8rem">
        <template #body="{ data }">
          <ToggleSwitch
            v-if="data.type === 'IMAGE' || data.type === 'VIDEO'"
            :model-value="data.isFullscreen"
            @update:model-value="onToggleFullscreen(data, $event)"
          />
          <span v-else class="text-muted">—</span>
        </template>
      </Column>

      <Column style="width: 4rem">
        <template #body="{ data }">
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            @click="confirmDelete(data.id, itemLabel(data))"
          />
        </template>
      </Column>
    </DataTable>

    <!-- アイテム追加ダイアログ -->
    <Dialog v-model:visible="showDialog" header="アイテムを追加" modal style="width: 28rem">
      <div class="dialog-body">
        <div class="field">
          <label>種別</label>
          <Select
            v-model="newType"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>

        <div v-if="!isVideo" class="field">
          <label>表示時間（秒）</label>
          <InputNumber
            v-model="newDuration"
            :min="1"
            :max="3600"
            suffix="秒"
            class="w-full"
          />
        </div>
        <div v-else class="field">
          <label>表示時間</label>
          <p class="natural-end">自然終了（動画の再生終了まで）</p>
        </div>

        <div v-if="needsMedia" class="field">
          <label>{{ isVideo ? '動画' : '画像' }}ファイル</label>
          <Select
            v-model="newMediaFileId"
            :options="mediaOptions"
            option-label="label"
            option-value="value"
            :placeholder="`${isVideo ? '動画' : '画像'}を選択`"
            class="w-full"
          />
          <small v-if="mediaOptions.length === 0" class="no-media">
            先に「メディア管理」でファイルをアップロードしてください
          </small>
        </div>

        <div v-if="needsMedia" class="field field-inline">
          <Checkbox v-model="newIsFullscreen" inputId="newIsFullscreen" binary />
          <label for="newIsFullscreen" class="inline-label">フルスクリーン表示（ヘッダーを隠す）</label>
        </div>
      </div>

      <template #footer>
        <Button label="キャンセル" text @click="showDialog = false" />
        <Button label="追加" icon="pi pi-check" @click="confirmAdd" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.playlist-view {
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-inline {
  flex-direction: row;
  align-items: center;
  gap: 0.6rem;
}

.field label {
  font-weight: 600;
  font-size: 0.875rem;
}

.inline-label {
  font-weight: 400;
  cursor: pointer;
}

.text-muted {
  color: #6c757d;
}

.natural-end {
  margin: 0;
  color: #6c757d;
  font-size: 0.875rem;
}

.no-media {
  color: #e17055;
}

.w-full {
  width: 100%;
}
</style>
