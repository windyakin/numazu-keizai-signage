import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchMe, type AuthUser } from '../api/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const enabled = ref(true)
  // 認証チェックが終わり画面を描画してよい状態か。未ログインのときは
  // ログインへ遷移するため ready にはしない (遷移中に shell を出さない)。
  const ready = ref(false)

  async function init() {
    const result = await fetchMe()
    if (result.state === 'unauthenticated') {
      window.location.href = '/api/auth/login'
      return
    }
    if (result.state === 'disabled') {
      enabled.value = false
      user.value = null
    } else {
      enabled.value = true
      user.value = result.user
    }
    ready.value = true
  }

  function logout() {
    window.location.href = '/api/auth/logout'
  }

  return { user, enabled, ready, init, logout }
})
