<script setup lang="ts">
import { computed } from "vue";
import type { RankingItem } from "../../api/access";

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
        <div class="ranking-slide__info">
          <span class="ranking-slide__rank">{{ item.rank }}</span>
          <p class="ranking-slide__item-title">{{ item.title }}</p>
        </div>
        <div class="ranking-slide__image-area">
          <img
            v-if="item.imageUrl"
            :src="item.imageUrl"
            :alt="item.title"
            class="ranking-slide__image"
          />
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
  padding: 24px var(--slide-padding-x) 16px;
}

.ranking-slide__title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text);
}

.ranking-slide__fetched {
  font-size: 1.2rem;
  font-weight: 400;
  color: var(--color-text-muted);
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
  align-items: center;
  gap: 16px;
  padding: 12px var(--slide-padding-x);
  min-width: 0;
}

.ranking-slide__image-area {
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
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
  background: var(--rank-color);
  border-radius: 50%;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.ranking-slide__item-title {
  font-size: 1.5vh;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
