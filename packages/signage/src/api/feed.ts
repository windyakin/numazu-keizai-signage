export interface Article {
  id: string;
  title: string;
  imageUrl: string;
  start: string;
}

interface ArticlesResponse {
  articles: Article[];
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8080/api";

export async function fetchArticles(): Promise<Article[]> {
  const res = await fetch(`${API_BASE_URL}/feed/articles`);
  if (!res.ok) {
    throw new Error(`Failed to fetch articles: ${res.status}`);
  }
  const data: ArticlesResponse = await res.json();
  return data.articles;
}
