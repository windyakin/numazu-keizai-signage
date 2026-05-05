<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  fetchPlaylist,
  type PlaylistItem,
  type MediaPayload,
} from "../../api/playlist";
import { fetchArticles, type Article } from "../../api/feed";
import { fetchRankings, type RankingsData } from "../../api/access";
import NewsArticleSlide from "../slides/NewsArticleSlide.vue";
import AccessRankingSlide from "../slides/AccessRankingSlide.vue";
import ImageSlide from "../slides/ImageSlide.vue";
import VideoSlide from "../slides/VideoSlide.vue";

// ── State ──────────────────────────────────────────────────────────────────
const playlistItems = ref<PlaylistItem[]>([]);
const articles = ref<Article[]>([]);
const rankingsData = ref<RankingsData>({ rankings: [], fetchedAt: null });
const currentIndex = ref(0);
const randomArticle = ref<Article | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const debugFixed = ref(false);

let slideTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let emptyRetryTimer: ReturnType<typeof setInterval> | null = null;
let pendingPlaylist: PlaylistItem[] | null = null;
let fetchingPlaylist = false;

const refreshIntervalMin = parseInt(
  import.meta.env.VITE_PLAYLIST_REFRESH_INTERVAL_MIN || "10",
  10
);
const EMPTY_RETRY_SEC = 30;

// ── Current item ───────────────────────────────────────────────────────────
const currentItem = computed(() => playlistItems.value[currentIndex.value] ?? null);

function isReady(item: PlaylistItem): boolean {
  if (item.type === "ARTICLE_LATEST" || item.type === "ARTICLE_RANDOM") return articles.value.length > 0;
  if (item.type === "RANKING") return rankingsData.value.rankings.length > 0;
  return item.payload !== null;
}

function findNextValidIndex(from: number): number | null {
  const len = playlistItems.value.length;
  if (len === 0) return null;
  for (let i = 0; i < len; i++) {
    const idx = (from + i) % len;
    if (isReady(playlistItems.value[idx])) return idx;
  }
  return null;
}

function pickRandom(): Article | null {
  if (articles.value.length === 0) return null;
  return articles.value[Math.floor(Math.random() * articles.value.length)];
}

// ── Slide navigation ───────────────────────────────────────────────────────
function scheduleNext(seconds: number): void {
  if (slideTimer) clearTimeout(slideTimer);
  slideTimer = setTimeout(advance, seconds * 1000);
}

function advance(): void {
  if (debugFixed.value) return;
  const len = playlistItems.value.length;
  if (len === 0) return;

  const next = findNextValidIndex(currentIndex.value + 1);
  if (next === null) return;

  const wrapped = next <= currentIndex.value;
  if (wrapped) {
    if (pendingPlaylist !== null && pendingPlaylist.length > 0) {
      playlistItems.value = pendingPlaylist;
      pendingPlaylist = null;
      const first = findNextValidIndex(0);
      if (first === null) return;
      goTo(first);
    } else {
      goTo(next);
    }
    void fetchNextPlaylist();
    return;
  }

  goTo(next);
}

function goTo(index: number): void {
  currentIndex.value = index;
  const item = playlistItems.value[index];
  if (item.type === "ARTICLE_RANDOM") {
    randomArticle.value = pickRandom();
  }
  if (item.type !== "VIDEO") {
    scheduleNext(item.durationSec ?? 8);
  }
}

function onVideoEnded(): void {
  advance();
}

// ── Resolved payload accessors ─────────────────────────────────────────────
const currentArticle = computed<Article | null>(() => {
  const item = currentItem.value;
  if (!item) return null;
  if (item.type === "ARTICLE_LATEST") return articles.value[0] ?? null;
  if (item.type === "ARTICLE_RANDOM") return randomArticle.value;
  return null;
});

const currentRanking = computed<RankingsData | null>(() => {
  const item = currentItem.value;
  if (!item || item.type !== "RANKING") return null;
  return rankingsData.value;
});

const currentMedia = computed<MediaPayload | null>(() => {
  const item = currentItem.value;
  if (!item || (item.type !== "IMAGE" && item.type !== "VIDEO")) return null;
  return item.payload as MediaPayload;
});

// ── Playlist fetch ─────────────────────────────────────────────────────────
async function loadInitial(): Promise<void> {
  const [data, fetchedArticles, fetchedRankings] = await Promise.all([fetchPlaylist(), fetchArticles(), fetchRankings()]);
  playlistItems.value = data.items;
  articles.value = fetchedArticles;
  rankingsData.value = fetchedRankings;
  if (currentIndex.value >= data.items.length && data.items.length > 0) {
    currentIndex.value = 0;
  }
}

async function fetchNextPlaylist(): Promise<void> {
  if (fetchingPlaylist) return;
  fetchingPlaylist = true;
  try {
    const data = await fetchPlaylist();
    if (data.items.length > 0) {
      pendingPlaylist = data.items;
    }
  } catch {
    // silently ignore - keep current playlist
  } finally {
    fetchingPlaylist = false;
  }
}

async function refreshArticlesAndRankings(): Promise<void> {
  try {
    const [fetchedArticles, fetchedRankings] = await Promise.all([fetchArticles(), fetchRankings()]);
    articles.value = fetchedArticles;
    rankingsData.value = fetchedRankings;
  } catch {
    // silently ignore background refresh errors
  }
}

async function retryWhenEmpty(): Promise<void> {
  if (playlistItems.value.length > 0) return;
  try {
    await loadInitial();
    if (playlistItems.value.length > 0) {
      error.value = null;
      const first = findNextValidIndex(0);
      if (first !== null) goTo(first);
    }
  } catch {
    // silently ignore - retry on next tick
  }
}

// ── Debug hash ─────────────────────────────────────────────────────────────
function applyDebugHash(): boolean {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return false;

  const match = hash.match(/^item-(\d+)$/);
  if (match) {
    const idx = parseInt(match[1], 10);
    if (idx >= 0 && idx < playlistItems.value.length) {
      currentIndex.value = idx;
      debugFixed.value = true;
      return true;
    }
  }

  return false;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    await loadInitial();

    if (applyDebugHash()) {
      const item = playlistItems.value[currentIndex.value];
      if (item?.type === "ARTICLE_RANDOM") randomArticle.value = pickRandom();
    } else {
      const first = findNextValidIndex(0);
      if (first !== null) goTo(first);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unknown error";
  } finally {
    loading.value = false;
  }

  refreshTimer = setInterval(refreshArticlesAndRankings, refreshIntervalMin * 60 * 1000);
  emptyRetryTimer = setInterval(retryWhenEmpty, EMPTY_RETRY_SEC * 1000);
});

onUnmounted(() => {
  if (slideTimer) clearTimeout(slideTimer);
  if (refreshTimer) clearInterval(refreshTimer);
  if (emptyRetryTimer) clearInterval(emptyRetryTimer);
});
</script>

<template>
  <div class="slide-area">
    <div v-if="loading" class="slide-area__loading">Loading...</div>
    <div v-else-if="error" class="slide-area__error">{{ error }}</div>
    <template v-else-if="playlistItems.length > 0 && currentItem">
      <Transition name="slide" mode="out-in">
        <NewsArticleSlide
          v-if="
            (currentItem.type === 'ARTICLE_LATEST' ||
              currentItem.type === 'ARTICLE_RANDOM') &&
            currentArticle
          "
          :key="`article-${currentItem.id}-${currentArticle.id}`"
          :article="currentArticle"
          :index="currentIndex"
        />
        <AccessRankingSlide
          v-else-if="currentItem.type === 'RANKING' && currentRanking"
          :key="`ranking-${currentItem.id}`"
          :rankings="currentRanking.rankings"
          :fetched-at="currentRanking.fetchedAt"
        />
        <ImageSlide
          v-else-if="currentItem.type === 'IMAGE' && currentMedia"
          :key="`image-${currentItem.id}`"
          :url="currentMedia.url"
        />
        <VideoSlide
          v-else-if="currentItem.type === 'VIDEO' && currentMedia"
          :key="`video-${currentItem.id}`"
          :url="currentMedia.url"
          :mime-type="currentMedia.mimeType"
          @ended="onVideoEnded"
        />
      </Transition>
    </template>
    <div v-else class="slide-area__loading">プレイリストが空です</div>
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
