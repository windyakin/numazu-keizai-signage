<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import TopBar from "./components/layout/TopBar.vue";
import SlideArea from "./components/layout/SlideArea.vue";

const IDLE_MS = 5000;
let hideCursorTimer: ReturnType<typeof setTimeout> | null = null;

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
  <TopBar />
  <SlideArea />
</template>
