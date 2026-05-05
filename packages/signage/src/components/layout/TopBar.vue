<script setup lang="ts">
import { computed } from "vue";
import { useClock } from "../../composables/useClock";
import logoSrc from "../../assets/logo.png";

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

const hours = computed(() => {
  return String(now.value.getHours()).padStart(2, "0");
});

const minutes = computed(() => {
  return String(now.value.getMinutes()).padStart(2, "0");
});

const colonVisible = computed(() => {
  return now.value.getSeconds() % 2 === 0;
});
</script>

<template>
  <div class="topbar">
    <img :src="logoSrc" alt="Logo" class="topbar__logo" />
    <span class="topbar__spacer" />
    <span class="topbar__date">{{ dateStr }}</span>
    <span class="topbar__time">{{ hours }}<span :class="{ 'topbar__colon--hidden': !colonVisible }">:</span>{{ minutes }}</span>
  </div>
</template>

<style scoped>
.topbar {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  padding: 0 var(--slide-padding-x);
  background: var(--color-primary);
  border-bottom: 2px solid var(--color-primary-dark);
  flex-shrink: 0;
  transition: height var(--transition-duration) ease,
    opacity var(--transition-duration) ease,
    border-bottom-width var(--transition-duration) ease;
}

.topbar__logo {
  height: 60%;
  width: auto;
  object-fit: contain;
}

.topbar__spacer {
  flex: 1;
}

.topbar__date {
  font-size: 1.2rem;
  font-weight: 300;
  margin-right: 24px;
  opacity: 0.8;
}

.topbar__time {
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.topbar__colon--hidden {
  visibility: hidden;
}
</style>
