<script setup lang="ts">
defineProps<{
  url: string;
  alt?: string;
}>();

const emit = defineEmits<{ error: [] }>();
</script>

<template>
  <div class="image-slide">
    <img
      :src="url"
      :alt="alt ?? ''"
      class="image-slide__img"
      @error="emit('error')"
    />
  </div>
</template>

<style scoped>
.image-slide {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-slide__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
</style>
