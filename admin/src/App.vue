<script setup lang="ts">
import { onMounted } from 'vue'
import ProgressSpinner from 'primevue/progressspinner'
import AppShell from './components/shell/AppShell.vue'
import { useAuthStore } from './stores/useAuthStore'

const auth = useAuthStore()

onMounted(() => {
  // 認証状態を確認。未ログインならストア内でログインへ遷移する。
  auth.init()
})
</script>

<template>
  <AppShell v-if="auth.ready" />
  <div v-else class="auth-loading">
    <ProgressSpinner />
  </div>
</template>

<style scoped>
.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}
</style>
