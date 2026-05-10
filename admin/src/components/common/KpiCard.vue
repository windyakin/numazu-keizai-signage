<script setup lang="ts">
import Panel from 'primevue/panel'
import PulseDot from './PulseDot.vue'

type Tone = 'live' | 'neutral'

interface Props {
  label: string
  value: string | number
  sub?: string
  tone?: Tone
  signal?: string
}

withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  sub: undefined,
  signal: undefined,
})
</script>

<template>
  <Panel :header="label">
    <div class="flex align-items-baseline gap-2">
      <div class="value tabular-nums">{{ value }}</div>
      <div v-if="sub" class="text-xs text-color-secondary">{{ sub }}</div>
    </div>
    <div v-if="tone === 'live' && signal" class="signal">
      <PulseDot color="var(--p-green-500)" />
      <span>{{ signal }}</span>
    </div>
  </Panel>
</template>

<style scoped>
.value {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.signal {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--p-green-600);
}
</style>
