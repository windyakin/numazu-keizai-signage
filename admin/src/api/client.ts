const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init)
  // セッション失効・未ログイン時はフルページでログイン起点へ遷移する。
  // (Cookie 認証のため fetch にトークンは載せない。同一オリジンで Cookie は自動付与。)
  if (res.status === 401) {
    window.location.href = '/api/auth/login'
    throw new Error('unauthorized')
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
