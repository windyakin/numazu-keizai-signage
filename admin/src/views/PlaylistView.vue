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
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Slider from 'primevue/slider'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { usePlaylistStore } from '../stores/usePlaylistStore'
import { useMediaStore } from '../stores/useMediaStore'
import type { PlaylistItem, PlaylistItemType, CreatePlaylistItemBody } from '../api/playlist'
import type { MediaFile } from '../api/media'

const route = useRoute()
const router = useRouter()
const playlistStore = usePlaylistStore()
const mediaStore = useMediaStore()
const confirm = useConfirm()
const toast = useToast()

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'
function mediaContentUrl(id: string) {
  return `${BASE_URL}/media/${id}/content`
}

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

function confirmDelete(id: string, label: string) {
  confirm.require({
    message: `「${label}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '削除', severity: 'danger' },
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
    <div class="flex align-items-center justify-content-between mb-4">
      <div class="flex align-items-center gap-2">
        <Button
          icon="pi pi-arrow-left"
          text
          size="small"
          @click="router.push('/playlists')"
        />
        <h1 class="m-0 text-xl">プレイリスト編集</h1>
      </div>
      <div class="flex gap-2">
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
      stripedRows
      @rowReorder="onReorder"
    >
      <template #empty>プレイリストが空です。アイテムを追加してください。</template>

      <Column rowReorder style="width: 3rem" />

      <Column header="#" style="width: 3rem">
        <template #body="{ index }">{{ index + 1 }}</template>
      </Column>

      <Column header="内容">
        <template #body="{ data }: { data: PlaylistItem }">
          <div class="flex align-items-center gap-2">
            <Tag :value="typeLabel[data.type]" :severity="typeSeverity[data.type]" />
            <img
              v-if="data.type === 'IMAGE' && data.mediaFile"
              :src="mediaContentUrl(data.mediaFile.id)"
              :alt="data.mediaFile.originalName"
              class="border-round thumbnail"
            />
            <span v-else-if="data.type === 'VIDEO' && data.mediaFile">
              {{ data.mediaFile.originalName }}
            </span>
          </div>
        </template>
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
          <span v-else class="text-color-secondary">—</span>
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

    <Dialog v-model:visible="showDialog" header="アイテムを追加" modal style="width: 28rem">
      <div class="flex flex-column gap-3 py-2">
        <div class="flex flex-column gap-2">
          <label class="font-semibold text-sm">種別</label>
          <Select
            v-model="newType"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>

        <div v-if="!isVideo" class="flex flex-column gap-2">
          <label class="font-semibold text-sm">表示時間</label>
          <div class="flex align-items-center gap-3">
            <Slider
              v-model="newDuration"
              :min="1"
              :max="60"
              :step="1"
              class="duration-slider"
            />
            <InputGroup class="duration-input-group">
              <InputNumber
                v-model="newDuration"
                :min="1"
                :max="60"
                :inputStyle="{ width: '3rem' }"
              />
              <InputGroupAddon>秒</InputGroupAddon>
            </InputGroup>
          </div>
        </div>
        <div v-else class="flex flex-column gap-2">
          <label class="font-semibold text-sm">表示時間</label>
          <p class="m-0 text-sm text-color-secondary">自然終了（動画の再生終了まで）</p>
        </div>

        <div v-if="needsMedia" class="flex flex-column gap-2">
          <label class="font-semibold text-sm">{{ isVideo ? '動画' : '画像' }}ファイル</label>
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

        <div v-if="needsMedia" class="flex align-items-center gap-2">
          <Checkbox v-model="newIsFullscreen" inputId="newIsFullscreen" binary />
          <label for="newIsFullscreen" class="cursor-pointer">フルスクリーン表示（ヘッダーを隠す）</label>
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
.no-media {
  color: #e17055;
}
.duration-slider {
  flex: 1 1 0;
  min-width: 0;
}
.duration-input-group {
  width: auto;
}
.thumbnail {
  width: 48px;
  height: 48px;
  object-fit: cover;
}
</style>
