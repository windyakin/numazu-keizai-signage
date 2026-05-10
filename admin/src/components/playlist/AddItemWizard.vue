<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Drawer from 'primevue/drawer'
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Slider from 'primevue/slider'
import Tag from 'primevue/tag'
import Thumb from '../common/Thumb.vue'
import { useMediaStore } from '../../stores/useMediaStore'
import type { MediaFile } from '../../api/media'
import type { CreatePlaylistItemBody, PlaylistItemType } from '../../api/playlist'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: { body: CreatePlaylistItemBody; mediaFile: MediaFile | null }]
}>()

const mediaStore = useMediaStore()

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'
function mediaContentUrl(id: string): string {
  return `${BASE_URL}/media/${id}/content`
}

type WizardKind = 'ARTICLE_LATEST' | 'ARTICLE_RANDOM' | 'RANKING' | 'MEDIA'

const kindOptions: { label: string; value: WizardKind; icon: string; description: string }[] = [
  { label: 'メディア表示', value: 'MEDIA', icon: 'pi pi-images', description: '画像・動画を表示' },
  { label: '最新記事', value: 'ARTICLE_LATEST', icon: 'pi pi-sparkles', description: '最新の記事を表示' },
  { label: 'ランダム記事', value: 'ARTICLE_RANDOM', icon: 'pi pi-sync', description: 'ランダムに記事を選択' },
  { label: 'ランキング', value: 'RANKING', icon: 'pi pi-trophy', description: 'アクセスランキングを表示' },
]

const defaultDurations: Record<PlaylistItemType, number> = {
  ARTICLE_LATEST: 8,
  ARTICLE_RANDOM: 8,
  RANKING: 16,
  IMAGE: 8,
  VIDEO: 0,
}

type MediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO'
const mediaTypeOptions: { label: string; value: MediaTypeFilter }[] = [
  { label: 'すべて', value: 'ALL' },
  { label: '画像', value: 'IMAGE' },
  { label: '動画', value: 'VIDEO' },
]

const wizardStep = ref<1 | 2 | 3>(1)
const selectedKind = ref<WizardKind | null>(null)
const selectedMediaFile = ref<MediaFile | null>(null)
const mediaSearch = ref('')
const mediaTypeFilter = ref<MediaTypeFilter>('ALL')
const newDuration = ref<number>(8)
const newIsFullscreen = ref(false)

const previewMedia = ref<MediaFile | null>(null)
const previewVisible = ref(false)

const needsMediaStep = computed(() => selectedKind.value === 'MEDIA')

const finalItemType = computed<PlaylistItemType | null>(() => {
  if (selectedKind.value === 'MEDIA') return selectedMediaFile.value?.type ?? null
  return selectedKind.value
})

const isVideo = computed(() => finalItemType.value === 'VIDEO')
const isMedia = computed(() => finalItemType.value === 'IMAGE' || finalItemType.value === 'VIDEO')

const filteredMediaFiles = computed<MediaFile[]>(() => {
  const q = mediaSearch.value.trim().toLowerCase()
  const t = mediaTypeFilter.value
  return mediaStore.files.filter((f) => {
    if (t !== 'ALL' && f.type !== t) return false
    if (q !== '' && !f.originalName.toLowerCase().includes(q)) return false
    return true
  })
})

const canAdvance = computed(() => {
  if (wizardStep.value === 1) return selectedKind.value !== null
  if (wizardStep.value === 2) return selectedMediaFile.value !== null
  return true
})

function resetState() {
  wizardStep.value = 1
  selectedKind.value = null
  selectedMediaFile.value = null
  mediaSearch.value = ''
  mediaTypeFilter.value = 'ALL'
  newDuration.value = 8
  newIsFullscreen.value = false
  previewMedia.value = null
  previewVisible.value = false
}

watch(
  () => props.visible,
  (v) => {
    if (v) resetState()
  },
)

function close() {
  emit('update:visible', false)
}

function nextStep() {
  if (!canAdvance.value) return
  if (wizardStep.value === 1) {
    wizardStep.value = needsMediaStep.value ? 2 : 3
    if (wizardStep.value === 3 && finalItemType.value) {
      newDuration.value = defaultDurations[finalItemType.value]
    }
  } else if (wizardStep.value === 2) {
    wizardStep.value = 3
    if (selectedMediaFile.value) {
      newDuration.value = defaultDurations[selectedMediaFile.value.type]
    }
  }
}

function prevStep() {
  if (wizardStep.value === 3) {
    wizardStep.value = needsMediaStep.value ? 2 : 1
  } else if (wizardStep.value === 2) {
    wizardStep.value = 1
  }
}

function selectKind(value: WizardKind) {
  if (selectedKind.value !== value) {
    selectedKind.value = value
    if (value !== 'MEDIA') selectedMediaFile.value = null
  }
}

function openMediaPreview(media: MediaFile) {
  previewMedia.value = media
  previewVisible.value = true
}

function closeMediaPreview() {
  previewVisible.value = false
}

function onPreviewKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMediaPreview()
}

watch(previewVisible, (v) => {
  if (v) {
    document.addEventListener('keydown', onPreviewKeydown)
  } else {
    document.removeEventListener('keydown', onPreviewKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onPreviewKeydown)
})

function confirmAdd() {
  const t = finalItemType.value
  if (!t) return
  if ((t === 'IMAGE' || t === 'VIDEO') && !selectedMediaFile.value) return

  let body: CreatePlaylistItemBody
  if (t === 'IMAGE') {
    body = {
      type: 'IMAGE',
      durationSec: newDuration.value,
      mediaFileId: selectedMediaFile.value!.id,
      isFullscreen: newIsFullscreen.value,
    }
  } else if (t === 'VIDEO') {
    body = {
      type: 'VIDEO',
      mediaFileId: selectedMediaFile.value!.id,
      isFullscreen: newIsFullscreen.value,
    }
  } else {
    body = { type: t, durationSec: newDuration.value }
  }
  emit('submit', { body, mediaFile: selectedMediaFile.value })
  close()
}
</script>

<template>
  <Drawer
    :visible="visible"
    position="right"
    :modal="true"
    :pt="{
      root: { style: { width: 'min(520px, 100vw)' } },
      content: { style: { display: 'flex', flexDirection: 'column', minHeight: 0 } },
    }"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <h2 class="my-0">アイテムを追加</h2>
    </template>

    <div class="wizard-body">
      <ol class="steps">
        <li :class="{ current: wizardStep === 1, done: wizardStep > 1 }">
          <span class="step-num">1</span><span class="step-label">種別</span>
        </li>
        <li :class="{
          current: wizardStep === 2,
          done: wizardStep > 2,
          inactive: !needsMediaStep,
        }">
          <span class="step-num">2</span><span class="step-label">ファイル</span>
        </li>
        <li :class="{ current: wizardStep === 3 }">
          <span class="step-num">3</span><span class="step-label">詳細</span>
        </li>
      </ol>

      <!-- Step 1: 種別 -->
      <div v-if="wizardStep === 1">
        <div class="mb-3">追加するアイテム種別を選択してください</div>
        <div class="kind-grid">
          <button
            v-for="opt in kindOptions"
            :key="opt.value"
            type="button"
            :class="['kind-card', { selected: selectedKind === opt.value }]"
            @click="selectKind(opt.value)"
          >
            <i :class="[opt.icon, 'kind-icon']" />
            <span class="kind-label">{{ opt.label }}</span>
            <span class="kind-desc">{{ opt.description }}</span>
          </button>
        </div>
      </div>

      <!-- Step 2: メディア選択 -->
      <div v-else-if="wizardStep === 2" class="media-picker flex flex-column gap-2">
        <div class="mb-2">メディアを選択してください</div>
        <SelectButton
          v-model="mediaTypeFilter"
          :options="mediaTypeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
        />
        <InputText
          v-model="mediaSearch"
          placeholder="ファイル名で検索"
          class="w-full"
        />
        <div v-if="filteredMediaFiles.length > 0" class="media-grid">
          <button
            v-for="f in filteredMediaFiles"
            :key="f.id"
            type="button"
            :class="['media-item', { selected: selectedMediaFile?.id === f.id }]"
            @click="selectedMediaFile = f"
          >
            <Thumb
              :src="f.type === 'IMAGE' ? mediaContentUrl(f.id) : null"
              :alt="f.originalName"
              :kind="f.type"
              width="100%"
              :height="120"
              :rounded="6"
            />
            <span class="media-item-name" :title="f.originalName">{{ f.originalName }}</span>
            <Tag
              :value="f.type === 'IMAGE' ? '画像' : '動画'"
              :severity="f.type === 'IMAGE' ? 'success' : 'info'"
              class="media-item-tag"
            />
            <button
              type="button"
              class="preview-btn"
              aria-label="プレビュー"
              @click.stop="openMediaPreview(f)"
            >
              <i class="pi pi-search" />
            </button>
          </button>
        </div>
        <div v-else-if="mediaStore.files.length === 0" class="empty-state">
          <i class="pi pi-image empty-icon" />
          <p class="m-0 no-media">
            先に「メディア管理」でファイルをアップロードしてください
          </p>
        </div>
        <div v-else class="empty-state">
          <i class="pi pi-search empty-icon" />
          <p class="m-0 text-color-secondary">該当するファイルがありません</p>
        </div>
      </div>

      <!-- Step 3: 詳細設定 -->
      <div v-else class="flex flex-column gap-3">
        <div class="summary">
          <Thumb
            :src="selectedMediaFile && selectedMediaFile.type === 'IMAGE'
              ? mediaContentUrl(selectedMediaFile.id) : null"
            :kind="finalItemType ?? 'PLACEHOLDER'"
            :width="64"
            :height="40"
            :rounded="6"
          />
          <div class="summary-text">
            <div class="summary-kind">{{ kindOptions.find((o) => o.value === selectedKind)?.label }}</div>
            <div v-if="selectedMediaFile" class="summary-name" :title="selectedMediaFile.originalName">
              {{ selectedMediaFile.originalName }}
            </div>
          </div>
        </div>

        <div v-if="!isVideo" class="flex flex-column gap-2">
          <label class="font-semibold text-sm">表示時間</label>
          <div class="flex align-items-center gap-3">
            <Slider v-model="newDuration" :min="1" :max="60" :step="1" class="duration-slider" />
            <InputGroup class="duration-input-group">
              <InputNumber v-model="newDuration" :min="1" :max="60" :input-style="{ width: '3rem' }" />
              <InputGroupAddon>秒</InputGroupAddon>
            </InputGroup>
          </div>
        </div>
        <div v-else class="flex flex-column gap-2">
          <label class="font-semibold text-sm">表示時間</label>
          <p class="m-0 text-sm text-color-secondary">フル再生（動画の再生終了まで）</p>
        </div>

        <div v-if="isMedia" class="flex align-items-center gap-2">
          <Checkbox v-model="newIsFullscreen" input-id="newIsFullscreen" binary />
          <label for="newIsFullscreen" class="cursor-pointer">フルスクリーン表示（ヘッダーを隠す）</label>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex align-items-center justify-content-between w-full">
        <Button
          v-if="wizardStep > 1"
          label="戻る"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="prevStep"
        />
        <span v-else />
        <div class="flex gap-2">
          <Button
            v-if="wizardStep < 3"
            label="次へ"
            icon="pi pi-arrow-right"
            icon-pos="right"
            :disabled="!canAdvance"
            @click="nextStep"
          />
          <Button
            v-else
            label="追加"
            icon="pi pi-check"
            @click="confirmAdd"
          />
        </div>
      </div>
    </template>
  </Drawer>

  <Teleport to="body">
    <Transition name="picker-preview-fade">
      <div
        v-if="previewVisible && previewMedia"
        class="picker-preview-backdrop"
        role="dialog"
        aria-modal="true"
        @click.self="closeMediaPreview"
      >
        <button
          type="button"
          class="picker-preview-close"
          aria-label="閉じる"
          @click="closeMediaPreview"
        >
          <i class="pi pi-times" />
        </button>
        <img
          v-if="previewMedia.type === 'IMAGE'"
          :src="mediaContentUrl(previewMedia.id)"
          :alt="previewMedia.originalName"
          class="picker-preview-media"
        />
        <video
          v-else
          :src="mediaContentUrl(previewMedia.id)"
          controls
          autoplay
          class="picker-preview-media"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.no-media {
  color: var(--p-orange-500);
}

.duration-slider {
  flex: 1 1 0;
  min-width: 0;
}

.duration-input-group {
  width: auto;
}

.wizard-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 0;
  min-height: 0;
}

.media-picker {
  flex: 1;
  min-height: 0;
}

.steps {
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.steps li {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--p-text-color-secondary);
}

.steps li:not(:last-child)::after {
  content: '';
  width: 16px;
  height: 1px;
  background: var(--p-content-border-color);
  margin-left: 4px;
}

.step-num {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--p-surface-100);
  color: var(--p-text-color-secondary);
  font-weight: 600;
  font-size: 11px;
}

.steps li.current .step-num {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.steps li.current .step-label {
  color: var(--p-text-color);
  font-weight: 600;
}

.steps li.done .step-num {
  background: var(--p-primary-100);
  color: var(--p-primary-color);
}

.steps li.inactive {
  opacity: 0.4;
}

/* Step 1: kind grid */
.kind-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.kind-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 20px 12px;
  background: var(--p-content-background);
  border: 2px solid var(--p-content-border-color);
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 120ms ease, background 120ms ease;
}

.kind-card:hover {
  background: var(--p-surface-50);
}

.kind-card.selected {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50);
}

.kind-icon {
  font-size: 28px;
  color: var(--p-text-color-secondary);
}

.kind-card.selected .kind-icon {
  color: var(--p-primary-color);
}

.kind-label {
  font-weight: 600;
}

.kind-desc {
  font-size: 0.9rem;
  color: var(--p-text-color-secondary);
  line-height: 1.4;
}

/* Step 2: media grid */
.media-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.media-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--p-content-background);
  border: 2px solid var(--p-content-border-color);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
  transition: border-color 120ms ease, background 120ms ease;
}

.media-item:hover {
  background: var(--p-surface-50);
}

.media-item.selected {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50);
}

.media-item-name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.media-item-tag {
  align-self: flex-start;
}

.preview-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
  transition: opacity 120ms ease, background 120ms ease;
}

.media-item:hover .preview-btn,
.media-item:focus-within .preview-btn {
  opacity: 1;
}

.preview-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  font-size: 28px;
  color: var(--p-text-color-secondary);
  opacity: 0.5;
}

/* Step 3: summary */
.summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--p-surface-50);
  border-radius: 8px;
}

.summary-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.summary-kind {
  font-size: 12px;
  color: var(--p-text-color-secondary);
}

.summary-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Media preview overlay (above PrimeVue Drawer mask) */
.picker-preview-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 32px;
}

.picker-preview-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.picker-preview-close {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: background 120ms ease;
}

.picker-preview-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.picker-preview-fade-enter-active,
.picker-preview-fade-leave-active {
  transition: opacity 180ms ease;
}

.picker-preview-fade-enter-from,
.picker-preview-fade-leave-to {
  opacity: 0;
}
</style>
