<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { fetchArticles, type Article } from "../../api/feed";
import { fetchRankings, type RankingItem } from "../../api/access";
import NewsArticleSlide from "../slides/NewsArticleSlide.vue";
import AccessRankingSlide from "../slides/AccessRankingSlide.vue";

const articles = ref<Article[]>([]);
const rankings = ref<RankingItem[]>([]);
const rankingFetchedAt = ref<string | null>(null);
const currentIndex = ref(0);
const showRanking = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);
const debugFixed = ref(false);

let timer: ReturnType<typeof setInterval> | null = null;

const durationSec = parseInt(
  import.meta.env.VITE_SLIDE_DURATION_SEC || "8",
  10
);

const rankingDurationSec = parseInt(
  import.meta.env.VITE_RANKING_DURATION_SEC || "16",
  10
);

function advanceSlide(): void {
  if (showRanking.value) {
    // ランキング表示後、記事の先頭に戻る
    showRanking.value = false;
    currentIndex.value = 0;
    scheduleNext(durationSec);
    return;
  }

  const nextIndex = currentIndex.value + 1;
  if (nextIndex >= articles.value.length) {
    // 記事が一巡した → ランキングを表示
    if (rankings.value.length > 0) {
      showRanking.value = true;
      scheduleNext(rankingDurationSec);
    } else {
      // ランキングがなければそのままループ
      currentIndex.value = 0;
      scheduleNext(durationSec);
    }
  } else {
    currentIndex.value = nextIndex;
    scheduleNext(durationSec);
  }
}

function scheduleNext(seconds: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(advanceSlide, seconds * 1000);
}

function applyDebugHash(): boolean {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return false;

  if (hash === "access-ranking" && rankings.value.length > 0) {
    showRanking.value = true;
    debugFixed.value = true;
    return true;
  }

  // #article-{index} で特定記事を固定表示 (例: #article-0, #article-3)
  const articleMatch = hash.match(/^article-(\d+)$/);
  if (articleMatch) {
    const idx = parseInt(articleMatch[1], 10);
    if (idx >= 0 && idx < articles.value.length) {
      currentIndex.value = idx;
      showRanking.value = false;
      debugFixed.value = true;
      return true;
    }
  }

  return false;
}

onMounted(async () => {
  try {
    const [fetchedArticles, fetchedRankings] = await Promise.all([
      fetchArticles(),
      fetchRankings(),
    ]);
    articles.value = fetchedArticles;
    rankings.value = fetchedRankings.rankings;
    rankingFetchedAt.value = fetchedRankings.fetchedAt;

    // デバッグ用: URLハッシュで特定スライドを固定表示
    if (applyDebugHash()) return;

    if (articles.value.length > 0) {
      scheduleNext(durationSec);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unknown error";
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="slide-area">
    <div v-if="loading" class="slide-area__loading">Loading...</div>
    <div v-else-if="error" class="slide-area__error">{{ error }}</div>
    <template v-else-if="articles.length > 0">
      <Transition name="slide" mode="out-in">
        <AccessRankingSlide
          v-if="showRanking"
          key="ranking"
          :rankings="rankings"
          :fetched-at="rankingFetchedAt"
        />
        <NewsArticleSlide
          v-else
          :key="articles[currentIndex].id"
          :article="articles[currentIndex]"
          :index="currentIndex"
        />
      </Transition>
    </template>
    <div v-else class="slide-area__loading">No articles</div>
  </div>
</template>

<style scoped>
.slide-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.slide-area__loading,
.slide-area__error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 1.5rem;
  color: var(--color-text-muted);
}

.slide-area__error {
  color: var(--color-error);
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity var(--transition-duration) ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
</style>
