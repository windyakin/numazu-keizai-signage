import { apiFetch } from './client'

export interface Article {
  id: string
  title: string
  imageUrl: string
  description: string | null
  start: string
}

interface ArticlesResponse {
  articles: Article[]
}

export async function fetchArticles(): Promise<Article[]> {
  const data = await apiFetch<ArticlesResponse>('/articles')
  return data.articles
}

export async function refreshFeed(): Promise<{ count: number }> {
  return apiFetch('/feed/refresh', { method: 'POST' })
}
