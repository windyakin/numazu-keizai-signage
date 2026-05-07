<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Card from 'primevue/card'
</script>

<template>
  <div class="grid">
    <div class="col-6 md:col-3">
      <RouterLink to="/playlists" class="square-card-link no-underline text-color">
        <Card
          class="h-full"
          :pt="{ body: { class: 'h-full justify-content-center' } }"
        >
          <template #content>
            <div class="flex flex-column align-items-center gap-3">
              <span class="pi pi-list text-4xl text-color-secondary" />
              <span>プレイリスト管理</span>
            </div>
          </template>
        </Card>
      </RouterLink>
    </div>
    <div class="col-6 md:col-3">
      <RouterLink to="/media" class="square-card-link no-underline text-color">
        <Card
          class="h-full"
          :pt="{ body: { class: 'h-full justify-content-center' } }"
        >
          <template #content>
            <div class="flex flex-column align-items-center gap-3">
              <span class="pi pi-images text-4xl text-color-secondary" />
              <span>メディア管理</span>
            </div>
          </template>
        </Card>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.square-card-link {
  display: block;
  aspect-ratio: 1 / 1;
}
</style>
