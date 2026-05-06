<script setup lang="ts">
import { computed } from "vue";
import type { RankingItem } from "../../api/rankings";

const props = defineProps<{
  rankings: RankingItem[];
  fetchedAt: string | null;
}>();

const top5 = computed(() => props.rankings.slice(0, 5));

const fetchedHour = computed(() => {
  if (!props.fetchedAt) return null;
  const d = new Date(props.fetchedAt);
  return d.getHours();
});

function formatDate(start: string): string {
  const d = new Date(start);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>

<template>
  <div class="ranking-slide">
    <div class="ranking-slide__header">
      <h2 class="ranking-slide__title">
        アクセスランキング
        <span v-if="fetchedHour !== null" class="ranking-slide__fetched">（{{ fetchedHour }}時集計）</span>
      </h2>
    </div>
    <div class="ranking-slide__rows">
      <div
        v-for="(item, i) in top5"
        :key="item.id"
        class="ranking-slide__row"
        :class="`ranking-slide__row--rank${item.rank}`"
        :style="{ animationDelay: `${i * 0.15}s` }"
      >
        <div class="ranking-slide__image-area">
          <img
            v-if="item.imageUrl"
            :src="item.imageUrl"
            :alt="item.title"
            class="ranking-slide__image"
          />
          <span class="ranking-slide__rank">{{ item.rank }}</span>
        </div>
        <div class="ranking-slide__info">
          <time class="ranking-slide__item-date" :datetime="item.start">
            {{ formatDate(item.start) }}
          </time>
          <h3 class="ranking-slide__item-title">{{ item.title }}</h3>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-slide {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-primary-dark);
  overflow: hidden;
}

.ranking-slide__header {
  flex-shrink: 0;
  padding: max(1.5vh, 1.5vw) var(--slide-padding-x);
  background: var(--color-text);
}

.ranking-slide__title {
  font-size: max(2.5vh, 2.5vw);
  font-weight: 700;
  color: var(--color-primary-dark);
}

.ranking-slide__fetched {
  font-size: max(2vh, 2vw);
  font-weight: 400;
  color: var(--color-primary);
}

.ranking-slide__rows {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ranking-slide__row {
  --rank-color: var(--color-primary);
  flex: 1;
  display: flex;
  flex-direction: row;
  border-top: 1px solid var(--color-border);
  min-height: 0;
  animation: row-slide-in 0.5s ease both;
}

.ranking-slide__row:first-child {
  border-top: none;
}

.ranking-slide__row:nth-child(odd) {
  background: var(--color-primary-dark);
}

.ranking-slide__row:nth-child(even) {
  background: var(--color-primary);
}

.ranking-slide__row--rank1 { --rank-color: #ffd700; }
.ranking-slide__row--rank2 { --rank-color: #c0c0c0; }
.ranking-slide__row--rank3 { --rank-color: #cd7f32; }
.ranking-slide__row--rank4 { --rank-color: #5b9bd5; }
.ranking-slide__row--rank5 { --rank-color: #7c8a96; }

.ranking-slide__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: max(0.6vh, 0.6vw);
  padding: max(1.2vh, 1.2vw) var(--slide-padding-x);
  min-width: 0;
}

.ranking-slide__image-area {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  aspect-ratio: 285 / 180;
  overflow: hidden;
}

.ranking-slide__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ranking-slide__rank {
  position: absolute;
  top: 6%;
  left: 4%;
  width: max(3.5vh, 3.5vw);
  height: max(3.5vh, 3.5vw);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: max(2.4vh, 2.4vw);
  font-weight: 700;
  color: #fff;
  background: var(--rank-color);
  border-radius: 50%;
  border: 2px solid #fff;
}

.ranking-slide__item-title {
  font-size: max(2vh, 2vw);
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ranking-slide__item-date {
  font-size: max(1vh, 1vw);
  color: var(--color-text-muted);
}

@keyframes row-slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
