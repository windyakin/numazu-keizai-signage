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
} from '../api/playlist'

export const usePlaylistStore = defineStore('playlist', () => {
  const items = ref<PlaylistItem[]>([])
  const loading = ref(false)
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

  async function add(playlistId: string, body: CreatePlaylistItemBody) {
    const item = await addPlaylistItem(playlistId, body)
    items.value = [...items.value, item]
  }

  async function update(playlistId: string, itemId: string, durationSec: number | null) {
    const item = await updatePlaylistItem(playlistId, itemId, durationSec)
    const idx = items.value.findIndex((i) => i.id === itemId)
    if (idx !== -1) {
      const next = [...items.value]
      next[idx] = item
      items.value = next
    }
  }

  async function remove(playlistId: string, itemId: string) {
    await deletePlaylistItem(playlistId, itemId)
    items.value = items.value.filter((i) => i.id !== itemId)
  }

  async function reorder(playlistId: string, ids: string[]) {
    items.value = await reorderPlaylist(playlistId, ids)
  }

  return { items, loading, error, load, add, update, remove, reorder }
})
