<script setup lang="ts">
import { computed } from "vue";
import type { Article } from "../../api/articles";

const props = defineProps<{
  article: Article;
  index: number;
}>();

const isSwapped = computed(() => props.index % 2 === 1);

const formattedDate = computed(() => {
  const d = new Date(props.article.start);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});
</script>

<template>
  <div class="news-slide" :class="{ 'news-slide--swapped': isSwapped }">
    <div v-if="article.imageUrl" class="news-slide__image-pane">
      <img
        :src="article.imageUrl"
        :alt="article.title"
        class="news-slide__image"
      />
    </div>
    <div class="news-slide__info-pane">
      <div class="news-slide__info-inner">
        <time class="news-slide__date" :datetime="article.start">
          {{ formattedDate }}
        </time>
        <h2 class="news-slide__title">{{ article.title }}</h2>
        <p v-if="article.description" class="news-slide__description">
          {{ article.description }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.news-slide {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
}

.news-slide__image-pane {
  flex: 1;
  overflow: hidden;
}

.news-slide__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  animation: zoom-out 8s ease-out both;
}

@keyframes zoom-out {
  from {
    transform: scale(1.1);
  }
  to {
    transform: scale(1);
  }
}

.news-slide__info-pane {
  flex: 1;
  background: var(--color-primary-dark);
  display: flex;
  align-items: center;
  justify-content: start;
  padding: var(--slide-padding-x);
}

.news-slide__info-inner {
  max-width: 100%;
}

.news-slide__date {
  display: block;
  font-size: 1.5rem;
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.news-slide__title {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1.5;
  color: var(--color-text);
}

.news-slide__description {
  margin-top: 24px;
  font-size: 2rem;
  line-height: 1.7;
  color: var(--color-text-muted);
}

/* Landscape: swap left/right */
.news-slide--swapped {
  flex-direction: row-reverse;
}

/* Landscape: pane slide-in vertically */
@media (orientation: landscape) {
  /* Normal (even) — image from bottom, info from top */
  .news-slide .news-slide__image-pane {
    animation: pane-from-bottom var(--transition-duration) ease both;
  }

  .news-slide .news-slide__info-pane {
    animation: pane-from-top var(--transition-duration) ease both;
  }

  /* Swapped (odd) — image from top, info from bottom */
  .news-slide--swapped .news-slide__image-pane {
    animation: pane-from-top var(--transition-duration) ease both;
  }

  .news-slide--swapped .news-slide__info-pane {
    animation: pane-from-bottom var(--transition-duration) ease both;
  }
}

/* Portrait: stack vertically */
@media (orientation: portrait) {
  .news-slide {
    flex-direction: column;
  }

  .news-slide--swapped {
    flex-direction: column-reverse;
  }

  .news-slide__info-pane {
    padding: var(--slide-padding-x);
  }

  .news-slide__title {
    font-size: 3rem;
  }

  /* Pane slide-in: normal (even) — image from right, info from left */
  .news-slide .news-slide__image-pane {
    animation: pane-from-right var(--transition-duration) ease both;
  }

  .news-slide .news-slide__info-pane {
    animation: pane-from-left var(--transition-duration) ease both;
  }

  /* Pane slide-in: swapped (odd) — image from left, info from right */
  .news-slide--swapped .news-slide__image-pane {
    animation: pane-from-left var(--transition-duration) ease both;
  }

  .news-slide--swapped .news-slide__info-pane {
    animation: pane-from-right var(--transition-duration) ease both;
  }
}

@keyframes pane-from-bottom {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes pane-from-top {
  from {
    transform: translateY(-100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes pane-from-right {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes pane-from-left {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}
</style>
