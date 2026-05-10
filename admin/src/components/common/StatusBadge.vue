<script setup lang="ts">
import { computed } from 'vue'
import Tag from 'primevue/tag'
import PulseDot from './PulseDot.vue'

type Tone = 'live' | 'warn' | 'error' | 'info' | 'neutral'

interface Props {
  tone?: Tone
  pulse?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  pulse: false,
})

const severity = computed(() => {
  switch (props.tone) {
    case 'live': return 'success'
    case 'warn': return 'warn'
    case 'error': return 'danger'
    case 'info': return 'info'
    default: return 'secondary'
  }
})
</script>

<template>
  <Tag :severity="severity" :pt="{ root: { class: 'badge' } }">
    <template #default>
      <PulseDot v-if="pulse" />
      <slot />
    </template>
  </Tag>
</template>

<style scoped>
:deep(.badge) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 500;
  padding: 3px 9px;
  border-radius: 999px;
}
</style>
