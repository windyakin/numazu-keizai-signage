<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataView from 'primevue/dataview'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import Panel from 'primevue/panel'
import { usePlaylistsStore } from '../stores/usePlaylistsStore'
import { fetchPlaylistItems, type Playlist, type PlaylistItem } from '../api/playlist'
import { setPageMeta } from '../composables/useTopbar'
import PageBreadcrumb from '../components/common/PageBreadcrumb.vue'
import PageHeader from '../components/common/PageHeader.vue'
import StatusBadge from '../components/common/StatusBadge.vue'
import Thumb from '../components/common/Thumb.vue'

setPageMeta({ title: 'プレイリスト' })

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'
function mediaContentUrl(id: string): string {
  return `${BASE_URL}/media/${id}/content`
}

const store = usePlaylistsStore()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

// Lazy-fetched preview items per playlist id
const previews = reactive<Record<string, PlaylistItem[] | undefined>>({})
const previewLoading = reactive<Record<string, boolean>>({})

async function loadPreview(playlistId: string) {
  if (previews[playlistId] !== undefined || previewLoading[playlistId]) return
  previewLoading[playlistId] = true
  try {
    const items = await fetchPlaylistItems(playlistId)
    previews[playlistId] = items.slice(0, 4)
  } catch {
    previews[playlistId] = []
  } finally {
    previewLoading[playlistId] = false
  }
}

onMounted(async () => {
  await store.load()
  // kick off lazy preview fetches; throttle naturally by relying on browser concurrency
  for (const pl of store.playlists) {
    loadPreview(pl.id)
  }
})

const showCreateDialog = ref(false)
const newName = ref('')

function openCreateDialog() {
  newName.value = ''
  showCreateDialog.value = true
}

async function confirmCreate() {
  if (!newName.value.trim()) return
  try {
    await store.create(newName.value.trim())
    showCreateDialog.value = false
    toast.add({ severity: 'success', summary: 'プレイリストを作成しました', life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: '作成失敗', detail: String(e), life: 5000 })
  }
}

async function activate(id: string, name: string) {
  try {
    await store.activate(id)
    toast.add({ severity: 'success', summary: `「${name}」をアクティブにしました`, life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'アクティブ化失敗', detail: String(e), life: 5000 })
  }
}

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
        toast.add({ severity: 'success', summary: '削除しました', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '削除失敗', detail: String(e), life: 5000 })
      }
    },
  })
}

// Per-card popup menu
const menuRefs = ref<Record<string, { toggle: (e: Event) => void } | null>>({})
const menuItemsByPl: Record<string, ReturnType<typeof buildMenuItems>> = {}

function buildMenuItems(pl: Playlist) {
  return [
    {
      label: pl.isActive ? 'アクティブ済み' : 'アクティブにする',
      icon: 'pi pi-check-circle',
      disabled: pl.isActive,
      command: () => activate(pl.id, pl.name),
    },
    {
      label: '削除',
      icon: 'pi pi-trash',
      disabled: pl.isActive,
      command: () => confirmDelete(pl.id, pl.name),
    },
  ]
}

function getMenuItems(pl: Playlist) {
  if (!menuItemsByPl[pl.id]) {
    menuItemsByPl[pl.id] = buildMenuItems(pl)
  }
  return menuItemsByPl[pl.id]
}

function setMenuRef(pl: Playlist): (el: unknown) => void {
  return (el) => {
    menuRefs.value[pl.id] = el as { toggle: (e: Event) => void } | null
  }
}

function openMenu(pl: Playlist, e: Event) {
  // rebuild to reflect latest isActive state
  menuItemsByPl[pl.id] = buildMenuItems(pl)
  menuRefs.value[pl.id]?.toggle(e)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP')
}

function previewSlots(playlistId: string): (PlaylistItem | null)[] {
  const items = previews[playlistId] ?? []
  const slots: (PlaylistItem | null)[] = [...items]
  while (slots.length < 4) slots.push(null)
  return slots.slice(0, 4)
}

</script>

<template>
  <div class="playlists-view">
    <PageBreadcrumb :items="[{ label: 'プレイリスト' }]" />
    <PageHeader title="プレイリスト" description="アクティブなプレイリストが端末で再生されます">
      <template #actions>
        <Button label="新規作成" icon="pi pi-plus" @click="openCreateDialog" />
      </template>
    </PageHeader>

    <Panel :pt="{ header: { class: 'hidden' }, content: { class: 'pt-3' }}">
      <DataView :value="store.playlists" layout="grid" data-key="id" :loading="store.loading">
        <template #empty>
          <div class="text-center text-color-secondary py-5">
            <i class="pi pi-list" style="font-size: 32px; opacity: 0.4" />
            <div class="mt-2">プレイリストがありません</div>
            <Button label="新規作成" icon="pi pi-plus" class="mt-3" @click="openCreateDialog" />
          </div>
        </template>

        <template #grid="{ items }">
          <div class="card-grid">
            <Card
              v-for="pl in (items as Playlist[])"
              :key="pl.id"
              :pt="{
                root: { class: 'card' },
                body: { class: 'p-0' },
                content: { class: 'p-0' },
              }"
              @click="router.push(`/playlists/${pl.id}`)"
            >
              <template #content>
                <div class="cover">
                  <div class="tiles">
                    <div
                      v-for="(slot, i) in previewSlots(pl.id)"
                      :key="i"
                      class="tile"
                    >
                      <Thumb
                        :src="slot && slot.mediaFile ? mediaContentUrl(slot.mediaFile.id) : null"
                        :kind="slot ? slot.type : 'PLACEHOLDER'"
                        width="100%"
                        height="100%"
                        :rounded="0"
                      />
                    </div>
                  </div>
                  <div v-if="pl.isActive" class="active-badge">
                    <StatusBadge tone="live" pulse>アクティブ</StatusBadge>
                  </div>
                </div>
                <div class="body">
                  <div class="flex align-items-start justify-content-between gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold name">{{ pl.name }}</div>
                      <div class="text-xs text-color-secondary mt-1">
                        {{ pl.itemCount }}項目 · 未スケジュール
                      </div>
                    </div>
                    <Button
                      icon="pi pi-ellipsis-h"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="メニュー"
                      @click.stop="openMenu(pl, $event)"
                    />
                    <Menu
                      :ref="setMenuRef(pl)"
                      :model="getMenuItems(pl)"
                      :popup="true"
                    />
                  </div>
                  <div class="flex align-items-center gap-2 mt-3 text-xs text-color-secondary">
                    <i class="pi pi-desktop" />
                    <span>未割当</span>
                    <span class="ml-auto">更新 {{ formatDate(pl.updatedAt) }}</span>
                  </div>
                </div>
              </template>
            </Card>
          </div>
        </template>
      </DataView>
    </Panel>

    <Dialog v-model:visible="showCreateDialog" header="新規プレイリスト作成" modal style="width: 24rem">
      <div class="flex flex-column gap-2 py-2">
        <label class="font-semibold text-sm">名前</label>
        <InputText v-model="newName" class="w-full" placeholder="プレイリスト名" @keyup.enter="confirmCreate" />
      </div>
      <template #footer>
        <Button label="キャンセル" text @click="showCreateDialog = false" />
        <Button label="作成" icon="pi pi-check" :disabled="!newName.trim()" @click="confirmCreate" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

:deep(.card) {
  cursor: pointer;
  overflow: hidden;
  transition: transform 120ms, box-shadow 120ms;
}

:deep(.card:hover) {
  transform: translateY(-1px);
  box-shadow: var(--p-card-shadow);
}

.cover {
  position: relative;
  background: var(--p-content-border-color);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  padding: 1px;
}

.tile {
  aspect-ratio: 16 / 9;
  background: var(--p-surface-100);
  overflow: hidden;
}

.active-badge {
  position: absolute;
  top: 10px;
  left: 10px;
}

.body {
  padding: 14px 16px 16px;
}

.name {
  font-size: 14.5px;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
