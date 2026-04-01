<script setup lang="ts">
import { computed } from "vue";
import { useClock } from "../../composables/useClock";

const { now } = useClock();

const dateStr = computed(() => {
  const d = now.value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const w = weekdays[d.getDay()];
  return `${y}/${m}/${day} (${w})`;
});

const timeStr = computed(() => {
  const d = now.value;
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
});
</script>

<template>
  <div class="topbar">
    <span class="topbar__date">{{ dateStr }}</span>
    <span class="topbar__time">{{ timeStr }}</span>
  </div>
</template>
