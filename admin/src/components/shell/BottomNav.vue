<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

interface NavItem {
  label: string
  icon: string
  route: string
}

const route = useRoute()

const items = computed<NavItem[]>(() => [
  { label: 'ホーム', icon: 'pi pi-th-large', route: '/' },
  { label: 'メディア', icon: 'pi pi-images', route: '/media' },
  { label: 'プレイリスト', icon: 'pi pi-list', route: '/playlists' },
  { label: 'ニュース', icon: 'pi pi-file', route: '/articles' },
])

function isActive(itemRoute: string): boolean {
  if (itemRoute === '/') return route.path === '/'
  return route.path === itemRoute || route.path.startsWith(`${itemRoute}/`)
}
</script>

<template>
  <nav class="bottomnav admin-safe-area-bottom" aria-label="モバイルナビ">
    <RouterLink
      v-for="item in items"
      :key="item.route"
      :to="item.route"
      :aria-current="isActive(item.route) ? 'page' : undefined"
      :class="['item', { 'item--active': isActive(item.route) }]"
    >
      <span :class="['icon', item.icon]" />
      <span class="label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottomnav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  height: var(--admin-bottomnav-h);
  background: var(--p-content-background);
  border-top: 1px solid var(--p-content-border-color);
  display: flex;
  align-items: stretch;
  justify-content: space-around;
}

.item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--p-text-color-secondary);
  text-decoration: none;
  font-size: 11px;
  transition: color 120ms;
}

.item:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.item--active {
  color: var(--p-primary-color);
  font-weight: 600;
}

.icon {
  font-size: 18px;
}
</style>
