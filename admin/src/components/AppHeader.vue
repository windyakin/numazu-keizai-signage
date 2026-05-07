<script setup lang="ts">
import Menubar from 'primevue/menubar'
import type { MenuItem } from 'primevue/menuitem'

interface NavItem extends MenuItem {
  route: string
}

const items: NavItem[] = [
  { label: 'ホーム', icon: 'pi pi-home', route: '/' },
  { label: 'プレイリスト', icon: 'pi pi-list', route: '/playlists' },
  { label: 'メディア', icon: 'pi pi-images', route: '/media' },
]
</script>

<template>
  <Menubar :model="items" pt:button:class="ml-auto" class="mb-3">
    <template #start>
      <router-link to="/" class="brand inline-flex align-items-center gap-2 mr-4 py-1 px-2 text-base font-semibold">
        <span class="pi pi-desktop text-xl" />
        <span class="white-space-nowrap">サイネージ管理画面</span>
      </router-link>
    </template>
    <template #item="{ item, props }">
      <router-link
        v-slot="{ href, navigate, isActive, isExactActive }"
        :to="(item as NavItem).route"
        custom
      >
        <a
          v-ripple
          :href="href"
          v-bind="props.action"
          :class="{ 'is-active': (item as NavItem).route === '/' ? isExactActive : isActive }"
          @click="navigate"
        >
          <span :class="item.icon" />
          <span>{{ item.label }}</span>
        </a>
      </router-link>
    </template>
  </Menubar>
</template>

<style scoped>
.brand {
  color: inherit;
  text-decoration: none;
}

a.is-active {
  background: var(--p-menubar-item-focus-background);
  color: var(--p-menubar-item-focus-color);
  border-radius: inherit;
}
</style>
