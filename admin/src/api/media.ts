import { apiFetch } from './client'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'

export interface MediaFile {
  id: string
  storageKey: string
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

export interface MediaPage {
  files: MediaFile[]
  total?: number
  limit?: number
  offset?: number
  nextCursor?: string | null
}

export interface FetchMediaOptions {
  limit?: number
  offset?: number
  cursor?: string
  q?: string
  type?: 'IMAGE' | 'VIDEO'
}

export async function fetchMedia(
  opts: FetchMediaOptions = {},
): Promise<MediaPage> {
  const params = new URLSearchParams()
  if (opts.limit !== undefined) params.set('limit', String(opts.limit))
  if (opts.offset !== undefined) params.set('offset', String(opts.offset))
  if (opts.cursor !== undefined) params.set('cursor', opts.cursor)
  if (opts.q !== undefined && opts.q !== '') params.set('q', opts.q)
  if (opts.type !== undefined) params.set('type', opts.type)
  const query = params.toString()
  const path = query ? `/media?${query}` : '/media'
  return apiFetch<MediaPage>(path)
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
