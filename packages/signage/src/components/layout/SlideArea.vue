<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { fetchArticles, type Article } from "../../api/feed";
import NewsArticleSlide from "../slides/NewsArticleSlide.vue";

const articles = ref<Article[]>([]);
const currentIndex = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;

const durationSec = parseInt(
  import.meta.env.VITE_SLIDE_DURATION_SEC || "8",
  10
);

onMounted(async () => {
  try {
    articles.value = await fetchArticles();
    if (articles.value.length > 0) {
      timer = setInterval(() => {
        currentIndex.value =
          (currentIndex.value + 1) % articles.value.length;
      }, durationSec * 1000);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unknown error";
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="slide-area">
    <div v-if="loading" class="slide-area__loading">Loading...</div>
    <div v-else-if="error" class="slide-area__error">{{ error }}</div>
    <template v-else-if="articles.length > 0">
      <Transition name="fade" mode="out-in">
        <NewsArticleSlide
          :key="articles[currentIndex].id"
          :article="articles[currentIndex]"
        />
      </Transition>
    </template>
    <div v-else class="slide-area__loading">No articles</div>
  </div>
</template>
