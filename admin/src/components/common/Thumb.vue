<script setup lang="ts">
import { computed } from 'vue'
import type { PlaylistItemType } from '../../api/playlist'

type ThumbKind = PlaylistItemType | 'IMAGE' | 'VIDEO' | 'PLACEHOLDER'

interface Props {
  src?: string | null
  alt?: string
  kind?: ThumbKind
  width?: number | string
  height?: number | string
  rounded?: number
}

const props = withDefaults(defineProps<Props>(), {
  src: null,
  alt: '',
  kind: 'PLACEHOLDER',
  width: 64,
  height: 40,
  rounded: 6,
})

const sizeStyle = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  borderRadius: `${props.rounded}px`,
}))

const iconClass = computed(() => {
  switch (props.kind) {
    case 'IMAGE': return 'pi pi-image'
    case 'VIDEO': return 'pi pi-video'
    case 'ARTICLE_LATEST': return 'pi pi-sparkles'
    case 'ARTICLE_RANDOM': return 'pi pi-sync'
    case 'RANKING': return 'pi pi-trophy'
    default: return 'pi pi-image'
  }
})
</script>

<template>
  <div class="box" :style="sizeStyle">
    <img
      v-if="src"
      class="img"
      :src="src"
      :alt="alt"
      loading="lazy"
    />
    <span v-else :class="['icon', iconClass]" />
  </div>
</template>

<style scoped>
.box {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--p-surface-100);
  display: grid;
  place-items: center;
  color: var(--p-text-color-secondary);
}

.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.icon {
  font-size: 18px;
  opacity: 0.6;
}
</style>
