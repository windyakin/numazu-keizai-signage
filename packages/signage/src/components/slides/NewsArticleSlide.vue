<script setup lang="ts">
import type { Article } from "../../api/feed";

defineProps<{
  article: Article;
}>();
</script>

<template>
  <div class="news-slide">
    <h2 class="news-slide__title">{{ article.title }}</h2>
    <div v-if="article.imageUrl" class="news-slide__image-wrapper">
      <img
        :src="article.imageUrl"
        :alt="article.title"
        class="news-slide__image"
      />
    </div>
  </div>
</template>
