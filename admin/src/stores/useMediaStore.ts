import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchMedia, uploadMedia, deleteMedia, type MediaFile } from '../api/media'

export interface UploadFailure {
  file: File
  error: unknown
}

export interface UploadResult {
  uploaded: number
  failed: UploadFailure[]
}

export const useMediaStore = defineStore('media', () => {
  const files = ref<MediaFile[]>([])
  const loading = ref(false)
  const uploading = ref(false)
  const error = ref<string | null>(null)

  const uploadIndex = ref(0)
  const uploadTotal = ref(0)
  const uploadFileName = ref('')
  const uploadLoaded = ref(0)
  const uploadFileSize = ref(0)

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

  async function uploadAll(targets: File[]): Promise<UploadResult> {
    if (uploading.value || targets.length === 0) {
      return { uploaded: 0, failed: [] }
    }
    uploading.value = true
    uploadTotal.value = targets.length
    const failed: UploadFailure[] = []
    let uploaded = 0
    try {
      for (let i = 0; i < targets.length; i++) {
        const file = targets[i]
        uploadIndex.value = i
        uploadFileName.value = file.name
        uploadLoaded.value = 0
        uploadFileSize.value = file.size
        try {
          const registered = await uploadMedia(file, ({ loaded, total }) => {
            uploadLoaded.value = loaded
            uploadFileSize.value = total
          })
          files.value = [registered, ...files.value]
          uploaded++
        } catch (e) {
          failed.push({ file, error: e })
        }
      }
    } finally {
      uploading.value = false
      uploadIndex.value = 0
      uploadTotal.value = 0
      uploadFileName.value = ''
      uploadLoaded.value = 0
      uploadFileSize.value = 0
    }
    return { uploaded, failed }
  }

  async function remove(id: string) {
    await deleteMedia(id)
    files.value = files.value.filter((f) => f.id !== id)
  }

  return {
    files,
    loading,
    uploading,
    error,
    uploadIndex,
    uploadTotal,
    uploadFileName,
    uploadLoaded,
    uploadFileSize,
    load,
    uploadAll,
    remove,
  }
})
