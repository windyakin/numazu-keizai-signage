<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import AppHeader from './components/AppHeader.vue'
</script>

<template>
  <div class="container">
    <Toast />
    <ConfirmDialog />
    <AppHeader />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.container {
  max-width: 800px;
  min-height: 100vh;
  margin: 0 auto;
}
</style>
