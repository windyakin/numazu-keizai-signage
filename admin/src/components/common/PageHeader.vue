<script setup lang="ts">
interface Props {
  title: string
  description?: string
}

withDefaults(defineProps<Props>(), {
  description: undefined,
})
</script>

<template>
  <header class="flex align-items-start justify-content-between flex-wrap gap-3 mb-4">
    <div>
      <h1 class="m-0 title">{{ title }}</h1>
      <p v-if="description" class="m-0 mt-1 text-color-secondary text-sm">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
</style>
