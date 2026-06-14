<script setup lang="ts">
import { computed, watch } from 'vue'
import Drawer from 'primevue/drawer'
import Tag from 'primevue/tag'
import type { MediaFile } from '../../api/media'
import { formatBytes } from '../../utils/format'

interface Props {
  visible: boolean
  media: MediaFile | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'

const contentUrl = computed(() =>
  props.media ? `${BASE_URL}/media/${props.media.id}/content` : null,
)

function close() {
  emit('update:visible', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  },
)

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox-fade">
      <div
        v-if="visible && media"
        class="lightbox-backdrop"
        role="dialog"
        aria-modal="true"
        @click.self="close"
      >
        <img
          v-if="media.type === 'IMAGE' && contentUrl"
          :src="contentUrl"
          :alt="media.originalName"
          class="media-img"
        />
        <video
          v-else-if="media.type === 'VIDEO' && contentUrl"
          :src="contentUrl"
          controls
          class="media-video"
        />
      </div>
    </Transition>
  </Teleport>

  <Drawer
    :visible="visible"
    position="right"
    :modal="false"
    :dismissable="false"
    :pt="{
      root: { style: { width: '340px', borderLeft: '1px solid var(--p-content-border-color)' } },
    }"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <span class="drawer-title">メディア情報</span>
    </template>

    <div v-if="media" class="meta">
      <h3 class="meta-name" :title="media.originalName">{{ media.originalName }}</h3>

      <dl class="meta-list">
        <dt>種別</dt>
        <dd>
          <Tag
            :value="media.type === 'IMAGE' ? '画像' : '動画'"
            :severity="media.type === 'IMAGE' ? 'success' : 'info'"
          />
        </dd>
        <dt>MIMEタイプ</dt>
        <dd class="break">{{ media.mimeType }}</dd>
        <dt>サイズ</dt>
        <dd class="tabular-nums">{{ formatBytes(media.sizeBytes) }}</dd>
        <dt>アップロード日時</dt>
        <dd class="tabular-nums">{{ formatDate(media.uploadedAt) }}</dd>
        <dt>プレイリスト使用</dt>
        <dd class="tabular-nums">{{ media.playlistItemCount }} 件</dd>
      </dl>

      <slot name="actions" :media="media" />
    </div>
  </Drawer>
</template>

<style scoped>
.lightbox-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  z-index: 1099;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 364px 24px 24px;
}

.media-img,
.media-video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 180ms ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

.drawer-title {
  font-size: 15px;
  font-weight: 600;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.meta-name {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  word-break: break-all;
  line-height: 1.45;
}

.meta-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 10px 16px;
  margin: 0;
}

.meta-list dt {
  color: var(--p-text-color-secondary);
  font-size: 12px;
  align-self: center;
}

.meta-list dd {
  margin: 0;
  font-size: 13px;
  align-self: center;
}

.meta-list dd.break {
  word-break: break-all;
}
</style>
