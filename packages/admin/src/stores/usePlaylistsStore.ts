import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  activatePlaylist,
  type Playlist,
} from '../api/playlist'

export const usePlaylistsStore = defineStore('playlists', () => {
  const playlists = ref<Playlist[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      playlists.value = await fetchPlaylists()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  async function create(name: string) {
    const pl = await createPlaylist(name)
    playlists.value = [...playlists.value, pl]
  }

  async function rename(id: string, name: string) {
    const pl = await renamePlaylist(id, name)
    const idx = playlists.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      const next = [...playlists.value]
      next[idx] = pl
      playlists.value = next
    }
  }

  async function remove(id: string) {
    await deletePlaylist(id)
    playlists.value = playlists.value.filter((p) => p.id !== id)
  }

  async function activate(id: string) {
    const pl = await activatePlaylist(id)
    playlists.value = playlists.value.map((p) => ({
      ...p,
      isActive: p.id === id ? pl.isActive : false,
    }))
  }

  return { playlists, loading, error, load, create, rename, remove, activate }
})
