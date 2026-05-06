<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="home-view">
    <h1>管理画面</h1>
    <div class="menu">
      <div class="menu-card" @click="router.push('/playlists')">
        <span class="pi pi-list" />
        <span>プレイリスト管理</span>
      </div>
      <div class="menu-card" @click="router.push('/media')">
        <span class="pi pi-images" />
        <span>メディア管理</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

h1 {
  font-size: 1.5rem;
  margin-bottom: 2rem;
}

.menu {
  display: flex;
  gap: 1.5rem;
}

.menu-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
  width: 160px;
}

.menu-card:hover {
  background-color: #f8f9fa;
}

.menu-card .pi {
  font-size: 2rem;
  color: #6c757d;
}
</style>
