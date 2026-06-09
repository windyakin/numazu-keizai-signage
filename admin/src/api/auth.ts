// 認証状態の取得。client.ts の apiFetch は 401 でログインへリダイレクトして
// しまうため、起動時ゲートでは未ログイン(401)も判別できるよう生の fetch を使う。

export interface AuthUser {
  sub: string
  email: string | null
  name: string | null
}

export type MeResult =
  | { state: 'disabled' } // 認証無効 (api 側 fail-open)
  | { state: 'authenticated'; user: AuthUser }
  | { state: 'unauthenticated' } // 認証は有効だが未ログイン

export async function fetchMe(): Promise<MeResult> {
  const res = await fetch('/api/auth/me')
  if (res.status === 401) return { state: 'unauthenticated' }
  if (!res.ok) throw new Error(`auth/me error: ${res.status}`)
  const data = (await res.json()) as { enabled: boolean; user?: AuthUser }
  if (!data.enabled) return { state: 'disabled' }
  if (data.user) return { state: 'authenticated', user: data.user }
  return { state: 'unauthenticated' }
}
