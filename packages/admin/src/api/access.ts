import { apiFetch } from './client'

export interface RankingItem {
  id: string
  title: string
  imageUrl: string
  rank: number
  start: string
}

export interface RankingsData {
  rankings: RankingItem[]
  fetchedAt: string | null
}

export async function fetchRankings(): Promise<RankingsData> {
  return apiFetch<RankingsData>('/rankings')
}

export async function refreshRankings(): Promise<{ count: number }> {
  return apiFetch('/access/refresh', { method: 'POST' })
}
