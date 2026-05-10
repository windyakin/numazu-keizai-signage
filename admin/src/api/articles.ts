import { apiFetch } from './client'

export interface Article {
  id: string
  title: string
  imageKey: string | null
  description: string | null
  start: string
  articleUrl: string | null
}

export interface ArticlesPage {
  articles: Article[]
  total?: number
  limit?: number
  offset?: number
  nextCursor?: string | null
}

export interface FetchArticlesOptions {
  limit?: number
  offset?: number
  cursor?: string
}

export async function fetchArticles(
  opts: FetchArticlesOptions = {},
): Promise<ArticlesPage> {
  const params = new URLSearchParams()
  if (opts.limit !== undefined) params.set('limit', String(opts.limit))
  if (opts.offset !== undefined) params.set('offset', String(opts.offset))
  if (opts.cursor !== undefined) params.set('cursor', opts.cursor)
  const query = params.toString()
  const path = query ? `/articles?${query}` : '/articles'
  return apiFetch<ArticlesPage>(path)
}

export async function refreshArticles(): Promise<{ count: number }> {
  return apiFetch('/articles/refresh', { method: 'POST' })
}
