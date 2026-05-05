import { apiFetch } from './client'

export type PlaylistItemType = 'ARTICLE_LATEST' | 'ARTICLE_RANDOM' | 'RANKING' | 'IMAGE' | 'VIDEO'

export interface PlaylistMediaFile {
  id: string
  url: string
  mimeType: string
  originalName: string
}

export interface PlaylistItem {
  id: string
  type: PlaylistItemType
  order: number
  durationSec: number | null
  isFullscreen: boolean
  mediaFile: PlaylistMediaFile | null
}

export interface Playlist {
  id: string
  name: string
  isActive: boolean
  itemCount: number
  createdAt: string
  updatedAt: string
}

export type CreatePlaylistItemBody =
  | { type: 'ARTICLE_LATEST'; durationSec: number }
  | { type: 'ARTICLE_RANDOM'; durationSec: number }
  | { type: 'RANKING'; durationSec: number }
  | { type: 'IMAGE'; durationSec: number; mediaFileId: string; isFullscreen?: boolean }
  | { type: 'VIDEO'; durationSec?: null; mediaFileId: string; isFullscreen?: boolean }

export interface UpdatePlaylistItemBody {
  durationSec?: number | null
  isFullscreen?: boolean
}

// Playlist CRUD

export async function fetchPlaylists(): Promise<Playlist[]> {
  const data = await apiFetch<{ playlists: Playlist[] }>('/playlists')
  return data.playlists
}

export async function createPlaylist(name: string): Promise<Playlist> {
  return apiFetch<Playlist>('/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function renamePlaylist(id: string, name: string): Promise<Playlist> {
  return apiFetch<Playlist>(`/playlists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function deletePlaylist(id: string): Promise<void> {
  await apiFetch<void>(`/playlists/${id}`, { method: 'DELETE' })
}

export async function activatePlaylist(id: string): Promise<Playlist> {
  return apiFetch<Playlist>(`/playlists/${id}/activate`, { method: 'PUT' })
}

// Playlist item CRUD

export async function fetchPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
  const data = await apiFetch<{ items: PlaylistItem[] }>(`/playlists/${playlistId}/items`)
  return data.items
}

export async function addPlaylistItem(
  playlistId: string,
  body: CreatePlaylistItemBody,
): Promise<PlaylistItem> {
  return apiFetch<PlaylistItem>(`/playlists/${playlistId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function updatePlaylistItem(
  playlistId: string,
  itemId: string,
  patch: UpdatePlaylistItemBody,
): Promise<PlaylistItem> {
  return apiFetch<PlaylistItem>(`/playlists/${playlistId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function deletePlaylistItem(playlistId: string, itemId: string): Promise<void> {
  await apiFetch<void>(`/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE' })
}

export async function reorderPlaylist(playlistId: string, ids: string[]): Promise<PlaylistItem[]> {
  const data = await apiFetch<{ items: PlaylistItem[] }>(
    `/playlists/${playlistId}/items/reorder`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    },
  )
  return data.items
}
