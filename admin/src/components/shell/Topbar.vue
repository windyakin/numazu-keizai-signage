<script setup lang="ts">
import Button from 'primevue/button'
import Toolbar from 'primevue/toolbar'
import { useTopbar } from '../../composables/useTopbar'

interface Props {
  showHamburger: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  toggleDrawer: []
}>()

const { state } = useTopbar()
</script>

<template>
  <Toolbar
    :pt="{
      root: { class: 'topbar' },
      start: { class: 'flex align-items-center gap-2 min-w-0' },
      end: { class: 'flex align-items-center gap-2' },
    }"
  >
    <template #start>
      <Button
        v-if="showHamburger"
        icon="pi pi-bars"
        text
        rounded
        severity="secondary"
        aria-label="メニューを開く"
        @click="emit('toggleDrawer')"
      />
      <div class="title min-w-0">
        <span v-if="state.title" class="text-base font-semibold white-space-nowrap overflow-hidden text-overflow-ellipsis">
          {{ state.title }}
        </span>
      </div>
    </template>
    <template #end>
      <slot name="end" />
    </template>
  </Toolbar>
</template>

<style scoped>
:deep(.topbar) {
  position: sticky;
  top: 0;
  z-index: 10;
  height: var(--topbar-h);
  border-radius: 0;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  padding: 0 16px;
  background: var(--p-content-background);
}

.title {
  flex: 1;
  min-width: 0;
}
</style>
