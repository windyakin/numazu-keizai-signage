import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchMedia, uploadMedia, deleteMedia, type MediaFile } from '../api/media'

export const useMediaStore = defineStore('media', () => {
  const files = ref<MediaFile[]>([])
  const loading = ref(false)
  const uploading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      files.value = await fetchMedia()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  async function upload(file: File) {
    uploading.value = true
    try {
      const registered = await uploadMedia(file)
      files.value = [registered, ...files.value]
      return registered
    } finally {
      uploading.value = false
    }
  }

  async function remove(id: string) {
    await deleteMedia(id)
    files.value = files.value.filter((f) => f.id !== id)
  }

  return { files, loading, uploading, error, load, upload, remove }
})
