<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Breadcrumb from 'primevue/breadcrumb'

export interface BreadcrumbItem {
  label?: string
  icon?: string
  route?: string
}

interface Props {
  items?: BreadcrumbItem[]
}

const props = withDefaults(defineProps<Props>(), { items: () => [] })

const route = useRoute()

const home = computed<BreadcrumbItem>(() => ({
  icon: 'pi pi-home',
  label: 'ホーム',
  route: route.path === '/' ? undefined : '/',
}))

const model = computed<BreadcrumbItem[]>(() => props.items)
</script>

<template>
  <Breadcrumb :home="home" :model="model" class="page-breadcrumb mb-5">
    <template #item="{ item, props: itemProps }">
      <RouterLink
        v-if="item.route"
        v-slot="{ href, navigate }"
        :to="item.route"
        custom
      >
        <a :href="href" v-bind="itemProps.action" @click="navigate">
          <span v-if="item.icon" :class="item.icon" />
          <span v-if="item.label" :class="{ 'ml-1': item.icon }">{{ item.label }}</span>
        </a>
      </RouterLink>
      <span v-else class="current" v-bind="itemProps.action">
        <span v-if="item.icon" :class="item.icon" />
        <span v-if="item.label" :class="{ 'ml-1': item.icon }">{{ item.label }}</span>
      </span>
    </template>
  </Breadcrumb>
</template>

<style scoped>
.page-breadcrumb {
  background: transparent;
  border: 0;
  padding: 0;
}

.current {
  color: var(--p-text-color);
  font-weight: bold;
}
</style>
