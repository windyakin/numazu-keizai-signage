<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  fetchPlaylist,
  reportPlayback,
  type PlaylistItem,
  type MediaPayload,
} from "../../api/playlist";
import { fetchArticles, type Article } from "../../api/articles";
import { fetchRankings, type RankingsData } from "../../api/rankings";
import { fetchWeather, type WeatherData } from "../../api/weather";
import NewsArticleSlide from "../slides/NewsArticleSlide.vue";
import RankingSlide from "../slides/RankingSlide.vue";
import WeatherSlide from "../slides/WeatherSlide.vue";
import ImageSlide from "../slides/ImageSlide.vue";
import VideoSlide from "../slides/VideoSlide.vue";

const emit = defineEmits<{
  (e: "fullscreenChange", value: boolean): void;
}>();

// State
const playlistItems = ref<PlaylistItem[]>([]);
const articles = ref<Article[]>([]);
const rankingsData = ref<RankingsData>({ rankings: [], fetchedAt: null });
const weatherData = ref<WeatherData>({ days: [], fetchedAt: null });
const currentIndex = ref(0);
const randomArticle = ref<Article | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const debugFixed = ref(false);

let slideTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let emptyRetryTimer: ReturnType<typeof setInterval> | null = null;
let errorRetryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPlaylist: PlaylistItem[] | null = null;
let pendingPlaylistId: string | null = null;
let currentPlaylistId: string | null = null;
let fetchingPlaylist = false;
let consecutiveErrors = 0;
const pickedRandomIds = new Set<string>();
const allSlidesError = ref(false);

const refreshIntervalMin = parseInt(
  import.meta.env.VITE_PLAYLIST_REFRESH_INTERVAL_MIN || "10",
  10
);
const EMPTY_RETRY_SEC = 30;
const ERROR_THRESHOLD = 5;
const ERROR_RETRY_SEC = 30;

// Current item
const currentItem = computed(() => playlistItems.value[currentIndex.value] ?? null);

function isReady(item: PlaylistItem): boolean {
  if (item.type === "ARTICLE_LATEST" || item.type === "ARTICLE_RANDOM") return articles.value.length > 0;
  if (item.type === "RANKING") return rankingsData.value.rankings.length > 0;
  if (item.type === "WEATHER") return weatherData.value.days.length > 0;
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
  let candidates = articles.value.filter((a) => !pickedRandomIds.has(a.id));
  if (candidates.length === 0) {
    pickedRandomIds.clear();
    candidates = articles.value;
  }
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  pickedRandomIds.add(picked.id);
  return picked;
}

// Slide navigation
function scheduleNext(seconds: number): void {
  if (slideTimer) clearTimeout(slideTimer);
  slideTimer = setTimeout(advance, seconds * 1000);
}

function moveToNext(): void {
  if (debugFixed.value) return;
  const len = playlistItems.value.length;
  if (len === 0) return;

  const next = findNextValidIndex(currentIndex.value + 1);
  if (next === null) return;

  const wrapped = next <= currentIndex.value;
  if (wrapped) {
    pickedRandomIds.clear();
    if (pendingPlaylist !== null && pendingPlaylist.length > 0) {
      playlistItems.value = pendingPlaylist;
      pendingPlaylist = null;
      currentPlaylistId = pendingPlaylistId;
      pendingPlaylistId = null;
      const first = findNextValidIndex(0);
      if (first === null) return;
      goTo(first);
      reportNow(false);
    } else {
      goTo(next);
      reportNow(true);
    }
    void fetchNextPlaylist();
    return;
  }

  goTo(next);
  reportNow(false);
}

function goTo(index: number): void {
  currentIndex.value = index;
  const item = playlistItems.value[index];
  if (item.type === "ARTICLE_RANDOM") {
    randomArticle.value = pickRandom();
  }
  const fullscreen =
    (item.type === "IMAGE" || item.type === "VIDEO") &&
    item.payload?.isFullscreen === true;
  emit("fullscreenChange", fullscreen);
  if (item.type !== "VIDEO") {
    scheduleNext(item.durationSec ?? 8);
  }
}

function reportNow(looped: boolean): void {
  if (!currentPlaylistId) return;
  const item = currentItem.value;
  if (!item) return;
  void reportPlayback({
    playlistId: currentPlaylistId,
    currentItemId: item.id,
    looped,
  });
}

function advance(): void {
  consecutiveErrors = 0;
  moveToNext();
}

function onVideoEnded(): void {
  advance();
}

function onSlideError(): void {
  consecutiveErrors++;
  if (consecutiveErrors >= ERROR_THRESHOLD) {
    allSlidesError.value = true;
    if (slideTimer) clearTimeout(slideTimer);
    slideTimer = null;
    if (errorRetryTimer) clearTimeout(errorRetryTimer);
    errorRetryTimer = setTimeout(() => {
      consecutiveErrors = 0;
      allSlidesError.value = false;
      errorRetryTimer = null;
      moveToNext();
    }, ERROR_RETRY_SEC * 1000);
    return;
  }
  moveToNext();
}

// Resolved payload accessors
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

const currentWeather = computed<WeatherData | null>(() => {
  const item = currentItem.value;
  if (!item || item.type !== "WEATHER") return null;
  return weatherData.value;
});

const currentMedia = computed<MediaPayload | null>(() => {
  const item = currentItem.value;
  if (!item || (item.type !== "IMAGE" && item.type !== "VIDEO")) return null;
  return item.payload as MediaPayload;
});

// Playlist fetch
async function loadInitial(): Promise<void> {
  const [data, fetchedArticles, fetchedRankings, fetchedWeather] = await Promise.all([
    fetchPlaylist(),
    fetchArticles(),
    fetchRankings(),
    fetchWeather(),
  ]);
  playlistItems.value = data.items;
  currentPlaylistId = data.id || null;
  articles.value = fetchedArticles;
  rankingsData.value = fetchedRankings;
  weatherData.value = fetchedWeather;
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
      pendingPlaylistId = data.id || null;
    }
  } catch {
    // silently ignore - keep current playlist
  } finally {
    fetchingPlaylist = false;
  }
}

async function refreshArticlesAndRankings(): Promise<void> {
  try {
    const [fetchedArticles, fetchedRankings, fetchedWeather] = await Promise.all([
      fetchArticles(),
      fetchRankings(),
      fetchWeather(),
    ]);
    articles.value = fetchedArticles;
    rankingsData.value = fetchedRankings;
    weatherData.value = fetchedWeather;
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
      if (first !== null) {
        goTo(first);
        reportNow(false);
      }
    }
  } catch {
    // silently ignore - retry on next tick
  }
}

// Debug hash
function applyDebugHash(): boolean {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return false;

  const match = hash.match(/^\/(\d+)$/);
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

// Lifecycle
onMounted(async () => {
  try {
    await loadInitial();

    if (applyDebugHash()) {
      const item = playlistItems.value[currentIndex.value];
      if (item?.type === "ARTICLE_RANDOM") randomArticle.value = pickRandom();
    } else {
      const first = findNextValidIndex(0);
      if (first !== null) {
        goTo(first);
        reportNow(false);
      }
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
  if (errorRetryTimer) clearTimeout(errorRetryTimer);
});
</script>

<template>
  <div class="slide-area">
    <div v-if="loading" class="slide-area__loading">Loading...</div>
    <div v-else-if="error" class="slide-area__error">{{ error }}</div>
    <div
      v-else-if="allSlidesError"
      class="slide-area__error"
    >
      コンテンツの読み込みに失敗しました
    </div>
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
          @error="onSlideError"
        />
        <RankingSlide
          v-else-if="currentItem.type === 'RANKING' && currentRanking"
          :key="`ranking-${currentItem.id}`"
          :rankings="currentRanking.rankings"
          :fetched-at="currentRanking.fetchedAt"
        />
        <WeatherSlide
          v-else-if="currentItem.type === 'WEATHER' && currentWeather"
          :key="`weather-${currentItem.id}`"
          :days="currentWeather.days"
          :fetched-at="currentWeather.fetchedAt"
        />
        <ImageSlide
          v-else-if="currentItem.type === 'IMAGE' && currentMedia"
          :key="`image-${currentItem.id}`"
          :url="currentMedia.url"
          @error="onSlideError"
        />
        <VideoSlide
          v-else-if="currentItem.type === 'VIDEO' && currentMedia"
          :key="`video-${currentItem.id}`"
          :url="currentMedia.url"
          :mime-type="currentMedia.mimeType"
          @ended="onVideoEnded"
          @error="onSlideError"
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
