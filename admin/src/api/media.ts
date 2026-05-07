import { apiFetch } from './client'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'

export interface MediaFile {
  id: string
  storageKey: string
  url: string
  mimeType: string
  type: 'IMAGE' | 'VIDEO'
  originalName: string
  sizeBytes: string | null
  uploadedAt: string
  playlistItemCount: number
}

export interface UploadProgress {
  loaded: number
  total: number
}

export async function fetchMedia(): Promise<MediaFile[]> {
  const data = await apiFetch<{ files: MediaFile[] }>('/media')
  return data.files
}

export function uploadMedia(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<MediaFile> {
  const type = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', type)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE_URL}/media/upload`)
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({ loaded: event.loaded, total: event.total })
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as MediaFile)
        } catch {
          reject(new Error('Invalid response'))
        }
      } else {
        reject(new Error(`API error: ${xhr.status}`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))
    xhr.send(formData)
  })
}

export async function deleteMedia(id: string): Promise<void> {
  await apiFetch<void>(`/media/${id}`, { method: 'DELETE' })
}
