import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchArticles, refreshArticles, type Article } from '../api/articles'

export const useArticlesStore = defineStore('articles', () => {
  const articles = ref<Article[]>([])
  const total = ref(0)
  const currentOffset = ref(0)
  const currentLimit = ref(25)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref<string | null>(null)

  async function loadPage(offset: number, limit: number) {
    loading.value = true
    error.value = null
    currentOffset.value = offset
    currentLimit.value = limit
    try {
      const page = await fetchArticles({ offset, limit })
      articles.value = page.articles
      total.value = page.total ?? page.articles.length
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
      await refreshArticles()
      await loadPage(currentOffset.value, currentLimit.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      throw e
    } finally {
      refreshing.value = false
    }
  }

  return {
    articles,
    total,
    currentOffset,
    currentLimit,
    loading,
    refreshing,
    error,
    loadPage,
    refresh,
  }
})
