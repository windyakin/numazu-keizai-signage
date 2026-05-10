<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Drawer from 'primevue/drawer'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import Sidebar from './Sidebar.vue'
import BottomNav from './BottomNav.vue'
import { useMediaQuery } from '../../composables/useMediaQuery'
import { provideTopbar } from '../../composables/useTopbar'

provideTopbar()

const isDesktop = useMediaQuery('(min-width: 1024px)')
const isMobile = useMediaQuery('(max-width: 720px)')

const drawerVisible = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => {
  drawerVisible.value = false
})
</script>

<template>
  <div :class="['shell', { 'shell--desktop': isDesktop }]">
    <Sidebar v-if="isDesktop" />
    <Drawer
      v-else
      v-model:visible="drawerVisible"
      position="left"
      :pt="{
        root: { class: 'drawer' },
        content: { class: 'p-0' },
      }"
    >
      <Sidebar variant="drawer" @navigate="drawerVisible = false" />
    </Drawer>

    <div class="main">
      <main class="content" :class="{ 'content--with-bottomnav': isMobile }">
        <RouterView />
      </main>
    </div>

    <BottomNav v-if="isMobile" />

    <Toast />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background: var(--p-surface-50);
}

.shell--desktop {
  display: grid;
  grid-template-columns: var(--admin-sidebar-w) 1fr;
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.content {
  flex: 1;
  padding: 24px 28px 60px;
}

.content--with-bottomnav {
  padding: 16px 14px calc(var(--admin-bottomnav-h) + 24px);
}

:deep(.drawer) {
  width: 280px;
}
</style>
