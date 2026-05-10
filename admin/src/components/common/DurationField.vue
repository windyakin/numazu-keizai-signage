<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import Inplace from 'primevue/inplace'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'

interface Props {
  modelValue: number
  defaultValue?: number
  isCustom?: boolean
  disabled?: boolean
  displayLabel?: string
  min?: number
  max?: number
}

const props = withDefaults(defineProps<Props>(), {
  defaultValue: undefined,
  isCustom: false,
  disabled: false,
  displayLabel: undefined,
  min: 1,
  max: 600,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  reset: []
}>()

const editing = ref(false)
const draft = ref<number>(props.modelValue)
const numberRef = ref<{ $el: HTMLElement } | null>(null)

watch(() => props.modelValue, (v) => {
  draft.value = v
})

watch(editing, async (isEditing) => {
  if (!isEditing) return
  await nextTick()
  const input = numberRef.value?.$el?.querySelector('input') as HTMLInputElement | null
  input?.focus()
  input?.select()
})

function commit(close: () => void) {
  const n = Math.max(props.min, Math.min(props.max, Math.round(draft.value ?? props.modelValue)))
  if (n !== props.modelValue) emit('update:modelValue', n)
  close()
}

function cancel(close: () => void) {
  draft.value = props.modelValue
  close()
}

function onKeydown(e: KeyboardEvent, close: () => void) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commit(close)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel(close)
  }
}

function onResetClick(e: MouseEvent) {
  e.stopPropagation()
  emit('reset')
}
</script>

<template>
  <div class="duration-field">
    <Inplace
      v-model:active="editing"
      :disabled="disabled"
      :pt="{
        display: { class: ['duration-display', { 'duration-display--custom': isCustom, 'duration-display--disabled': disabled }] },
        content: { class: 'duration-content' },
      }"
    >
      <template #display>
        <template v-if="displayLabel !== undefined">
          <span>{{ displayLabel }}</span>
        </template>
        <template v-else>
          <span v-if="isCustom" class="dot" aria-hidden="true" />
          <span class="tabular-nums">{{ modelValue }}</span>
          <span class="unit">秒</span>
        </template>
      </template>
      <template #content="{ closeCallback }">
        <InputNumber
          ref="numberRef"
          v-model="draft"
          :min="min"
          :max="max"
          :allow-empty="false"
          :show-buttons="false"
          suffix="秒"
          size="small"
          :input-style="{ width: '4rem' }"
          @blur="commit(closeCallback)"
          @keydown="onKeydown($event, closeCallback)"
        />
      </template>
    </Inplace>
    <Button
      v-if="!editing && isCustom && !disabled"
      icon="pi pi-undo"
      text
      rounded
      severity="secondary"
      size="small"
      aria-label="デフォルトに戻す"
      :title="defaultValue !== undefined ? `デフォルト (${defaultValue}秒) に戻す` : 'デフォルトに戻す'"
      @click="onResetClick"
    />
  </div>
</template>

<style scoped>
.duration-field {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 5.5rem;
}

.duration-display {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  color: var(--p-text-color-secondary);
  cursor: pointer;
  transition: background 100ms, border-color 100ms;
}

.duration-display:hover {
  background: var(--p-content-hover-background);
  border-color: var(--p-content-border-color);
}

.duration-display--custom {
  color: var(--p-text-color);
}

.duration-display--custom .tabular-nums {
  font-weight: 700;
}

.duration-display--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.duration-content {
  display: inline-flex;
  align-items: center;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--p-primary-color);
}

.unit {
  opacity: 0.7;
}
</style>
