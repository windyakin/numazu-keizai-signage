<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Avatar from 'primevue/avatar'
import Divider from 'primevue/divider'

interface NavItem {
  label: string
  icon: string
  route: string
}

interface Props {
  variant?: 'desktop' | 'drawer'
}

withDefaults(defineProps<Props>(), { variant: 'desktop' })

const emit = defineEmits<{
  navigate: []
}>()

const route = useRoute()

const items = computed<NavItem[]>(() => [
  { label: 'ダッシュボード', icon: 'pi pi-th-large', route: '/' },
  { label: 'メディアライブラリ', icon: 'pi pi-images', route: '/media' },
  { label: 'プレイリスト', icon: 'pi pi-list', route: '/playlists' },
  { label: 'ニュース', icon: 'pi pi-file', route: '/articles' },
])

function isActive(itemRoute: string): boolean {
  if (itemRoute === '/') return route.path === '/'
  return route.path === itemRoute || route.path.startsWith(`${itemRoute}/`)
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <Avatar label="S" shape="square" :pt="{ root: { class: 'brand-mark' } }" />
      <div class="brand-text">
        <div class="font-semibold">Signage</div>
        <div class="text-xs text-color-secondary">管理画面</div>
      </div>
    </div>

    <Divider class="m-0" />

    <nav class="nav-area" aria-label="主要ナビゲーション">
      <ul class="nav-list">
        <li v-for="item in items" :key="item.route">
          <RouterLink
            :to="item.route"
            :aria-current="isActive(item.route) ? 'page' : undefined"
            :class="['nav-item', { 'nav-item--active': isActive(item.route) }]"
            @click="emit('navigate')"
          >
            <span :class="['icon', item.icon]" />
            <span class="label">{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="footer">
      <Avatar label="A" shape="circle" />
      <div class="flex flex-column">
        <span class="text-sm font-semibold">管理者</span>
        <span class="text-xs text-color-secondary">admin</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--p-content-background);
  border-right: 1px solid var(--p-content-border-color);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: var(--admin-topbar-h);
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.sidebar :deep(.brand-mark) {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  font-weight: 600;
  font-size: 13px;
  background: var(--p-text-color);
  color: var(--p-content-background);
}

.nav-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--p-text-color-secondary);
  font-size: 13.5px;
  text-decoration: none;
  transition: background 120ms, color 120ms;
}

.nav-item:hover {
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.nav-item:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.nav-item--active {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
  font-weight: 600;
}

.icon {
  font-size: 16px;
  width: 18px;
  text-align: center;
}

.label {
  flex: 1;
}

.footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}
</style>
