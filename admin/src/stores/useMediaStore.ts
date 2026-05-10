import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import {
  fetchMedia,
  uploadMedia,
  deleteMedia,
  type MediaFile,
} from '../api/media'

const PAGE_SIZE = 50

export interface MediaFilters {
  q: string
  type: 'IMAGE' | 'VIDEO' | null
}

export const useMediaStore = defineStore('media', () => {
  const files = ref<MediaFile[]>([])
  const filters = reactive<MediaFilters>({ q: '', type: null })
  const cursor = ref<string | null>(null)
  const hasMore = ref(false)
  const loading = ref(false)
  const loadingMore = ref(false)
  const uploading = ref(false)
  const error = ref<string | null>(null)

  function buildOpts(extra: { cursor?: string } = {}) {
    return {
      limit: PAGE_SIZE,
      q: filters.q || undefined,
      type: filters.type ?? undefined,
      ...extra,
    }
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      const page = await fetchMedia(buildOpts())
      files.value = page.files
      cursor.value = page.nextCursor ?? null
      hasMore.value = !!page.nextCursor
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loadingMore.value || !cursor.value) return
    loadingMore.value = true
    try {
      const page = await fetchMedia(buildOpts({ cursor: cursor.value }))
      files.value = [...files.value, ...page.files]
      cursor.value = page.nextCursor ?? null
      hasMore.value = !!page.nextCursor
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loadingMore.value = false
    }
  }

  function setFilters(patch: Partial<MediaFilters>) {
    Object.assign(filters, patch)
    return load()
  }

  async function uploadOne(file: File): Promise<MediaFile> {
    uploading.value = true
    try {
      return await uploadMedia(file)
    } finally {
      uploading.value = false
    }
  }

  function prependFile(media: MediaFile) {
    files.value = [media, ...files.value]
  }

  async function remove(id: string) {
    await deleteMedia(id)
    files.value = files.value.filter((f) => f.id !== id)
  }

  return {
    files,
    filters,
    cursor,
    hasMore,
    loading,
    loadingMore,
    uploading,
    error,
    load,
    loadMore,
    setFilters,
    uploadOne,
    prependFile,
    remove,
  }
})
