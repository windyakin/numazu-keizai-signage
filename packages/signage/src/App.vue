<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import TopBar from "./components/layout/TopBar.vue";
import SlideArea from "./components/layout/SlideArea.vue";

const IDLE_MS = 5000;
let hideCursorTimer: ReturnType<typeof setTimeout> | null = null;

const isFullscreenSlide = ref(false);

function onMouseMove() {
  document.documentElement.classList.remove("cursor-hidden");
  if (hideCursorTimer !== null) clearTimeout(hideCursorTimer);
  hideCursorTimer = setTimeout(() => {
    document.documentElement.classList.add("cursor-hidden");
  }, IDLE_MS);
}

onMounted(() => {
  document.documentElement.classList.add("cursor-hidden");
  document.addEventListener("mousemove", onMouseMove);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  if (hideCursorTimer !== null) clearTimeout(hideCursorTimer);
});
</script>

<template>
  <TopBar :class="{ 'topbar--collapsed': isFullscreenSlide }" />
  <SlideArea @fullscreen-change="isFullscreenSlide = $event" />
</template>

<style>
.topbar--collapsed {
  height: 0 !important;
  opacity: 0;
  border-bottom-width: 0 !important;
  overflow: hidden;
}
</style>
