import { apiFetch } from './client'

export interface MediaFile {
  id: string
  storageKey: string
  url: string
  mimeType: string
  type: 'IMAGE' | 'VIDEO'
  originalName: string
  sizeBytes: string | null
  uploadedAt: string
}

export async function fetchMedia(): Promise<MediaFile[]> {
  const data = await apiFetch<{ files: MediaFile[] }>('/media')
  return data.files
}

export async function uploadMedia(file: File): Promise<MediaFile> {
  const type = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', type)
  // Content-Type は設定しない（browser が multipart boundary を自動付与する）
  return apiFetch<MediaFile>('/media/upload', { method: 'POST', body: formData })
}

export async function deleteMedia(id: string): Promise<void> {
  await apiFetch<void>(`/media/${id}`, { method: 'DELETE' })
}
