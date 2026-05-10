import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchPlaylistItems,
  addPlaylistItem,
  updatePlaylistItem,
  deletePlaylistItem,
  reorderPlaylist,
  type PlaylistItem,
  type CreatePlaylistItemBody,
  type UpdatePlaylistItemBody,
} from '../api/playlist'

export interface SavePlan {
  deletes: string[]
  patches: { id: string; patch: UpdatePlaylistItemBody }[]
  creates: { tempId: string; body: CreatePlaylistItemBody }[]
  finalOrder: string[]
}

export const usePlaylistStore = defineStore('playlist', () => {
  const items = ref<PlaylistItem[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function load(playlistId: string) {
    loading.value = true
    error.value = null
    try {
      items.value = await fetchPlaylistItems(playlistId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  async function saveAll(playlistId: string, plan: SavePlan) {
    saving.value = true
    try {
      for (const id of plan.deletes) {
        await deletePlaylistItem(playlistId, id)
      }
      for (const { id, patch } of plan.patches) {
        await updatePlaylistItem(playlistId, id, patch)
      }
      const tempIdToReal = new Map<string, string>()
      for (const { tempId, body } of plan.creates) {
        const created = await addPlaylistItem(playlistId, body)
        tempIdToReal.set(tempId, created.id)
      }
      const resolvedOrder = plan.finalOrder.map((id) => tempIdToReal.get(id) ?? id)
      const needsReorder =
        plan.deletes.length > 0 ||
        plan.creates.length > 0 ||
        resolvedOrder.some((id, i) => items.value[i]?.id !== id)
      if (needsReorder) {
        items.value = await reorderPlaylist(playlistId, resolvedOrder)
      } else {
        items.value = await fetchPlaylistItems(playlistId)
      }
    } finally {
      saving.value = false
    }
  }

  return { items, loading, saving, error, load, saveAll }
})
