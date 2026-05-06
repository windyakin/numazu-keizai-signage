<script setup lang="ts">
defineProps<{
  url: string;
  mimeType?: string;
}>();

const emit = defineEmits<{ ended: [] }>();
</script>

<template>
  <div class="video-slide">
    <video
      :src="url"
      autoplay
      muted
      playsinline
      class="video-slide__video"
      @ended="emit('ended')"
    />
  </div>
</template>

<style scoped>
.video-slide {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-slide__video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
</style>
