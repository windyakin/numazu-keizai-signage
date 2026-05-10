import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchRankings, refreshRankings, type RankingItem } from '../api/rankings'

export const useRankingsStore = defineStore('rankings', () => {
  const rankings = ref<RankingItem[]>([])
  const fetchedAt = ref<string | null>(null)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const data = await fetchRankings()
      rankings.value = data.rankings
      fetchedAt.value = data.fetchedAt
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    refreshing.value = true
    error.value = null
    try {
      await refreshRankings()
      const data = await fetchRankings()
      rankings.value = data.rankings
      fetchedAt.value = data.fetchedAt
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      throw e
    } finally {
      refreshing.value = false
    }
  }

  return { rankings, fetchedAt, loading, refreshing, error, load, refresh }
})
