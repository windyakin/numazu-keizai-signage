<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Panel from 'primevue/panel'
import KpiCard from '../components/common/KpiCard.vue'
import PageBreadcrumb from '../components/common/PageBreadcrumb.vue'
import PageHeader from '../components/common/PageHeader.vue'
import StatusBadge from '../components/common/StatusBadge.vue'
import { useMediaStore } from '../stores/useMediaStore'
import { usePlaylistsStore } from '../stores/usePlaylistsStore'
import { setPageMeta } from '../composables/useTopbar'
import { fetchArticles } from '../api/articles'

setPageMeta({ title: 'ダッシュボード' })

const router = useRouter()
const mediaStore = useMediaStore()
const playlistsStore = usePlaylistsStore()

const articleCount = ref<number | null>(null)

onMounted(async () => {
  await Promise.all([mediaStore.load(), playlistsStore.load()])
  try {
    const page = await fetchArticles({ offset: 0, limit: 1 })
    articleCount.value = page.total ?? page.articles.length
  } catch {
    articleCount.value = null
  }
})

const activePlaylist = computed(() => playlistsStore.playlists.find((p) => p.isActive) ?? null)

const imageCount = computed(() => mediaStore.files.filter((f) => f.type === 'IMAGE').length)
const videoCount = computed(() => mediaStore.files.filter((f) => f.type === 'VIDEO').length)
const unusedCount = computed(() => mediaStore.files.filter((f) => f.playlistItemCount === 0).length)
const usedCount = computed(() => mediaStore.files.filter((f) => f.playlistItemCount > 0).length)
</script>

<template>
  <div class="dashboard">
    <PageBreadcrumb />
    <PageHeader title="ダッシュボード" description="サイネージ運用状況をひと目で確認">
      <template #actions>
        <Button
          label="メディアを追加"
          icon="pi pi-upload"
          severity="secondary"
          outlined
          @click="router.push('/media')"
        />
        <Button
          label="プレイリストを編集"
          icon="pi pi-list"
          @click="router.push('/playlists')"
        />
      </template>
    </PageHeader>

    <!-- KPI -->
    <div class="kpis mb-4">
      <KpiCard label="メディア合計" :value="mediaStore.files.length" sub="ファイル" />
      <KpiCard label="プレイリスト" :value="playlistsStore.playlists.length" sub="本" />
      <KpiCard
        label="アクティブなプレイリスト"
        :value="activePlaylist?.name ?? '未設定'"
        :tone="activePlaylist ? 'live' : 'neutral'"
        :signal="activePlaylist ? '配信中' : undefined"
      />
      <KpiCard
        v-if="articleCount !== null"
        label="記事キャッシュ"
        :value="articleCount"
        sub="件"
      />
    </div>

    <!-- Active playlist + media summary -->
    <div class="row">
      <Panel header="アクティブなプレイリスト">
        <template #icons>
          <Button
            v-if="activePlaylist"
            label="編集"
            icon="pi pi-arrow-right"
            icon-pos="right"
            size="small"
            text
            severity="secondary"
            @click="router.push(`/playlists/${activePlaylist.id}`)"
          />
        </template>
        <div v-if="activePlaylist" class="flex align-items-center gap-3">
          <div class="play-chip">
            <i class="pi pi-play" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold">{{ activePlaylist.name }}</div>
            <div class="text-xs text-color-secondary mt-1">
              {{ activePlaylist.itemCount }}項目 · 未スケジュール
            </div>
          </div>
          <StatusBadge tone="live" pulse>配信中</StatusBadge>
        </div>
        <div v-else class="text-color-secondary text-sm">
          アクティブなプレイリストがありません。
          <Button
            label="プレイリストを選ぶ"
            size="small"
            text
            @click="router.push('/playlists')"
          />
        </div>
      </Panel>

      <Panel header="メディアサマリ">
        <ul class="summary">
          <li>
            <span class="pi pi-image" />
            <span>画像</span>
            <strong class="tabular-nums">{{ imageCount }}</strong>
          </li>
          <li>
            <span class="pi pi-video" />
            <span>動画</span>
            <strong class="tabular-nums">{{ videoCount }}</strong>
          </li>
          <li>
            <span class="pi pi-check-circle" />
            <span>使用中</span>
            <strong class="tabular-nums">{{ usedCount }}</strong>
          </li>
          <li>
            <span class="pi pi-circle" />
            <span>未使用</span>
            <strong class="tabular-nums">{{ unusedCount }}</strong>
          </li>
        </ul>
      </Panel>
    </div>
  </div>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .row {
    grid-template-columns: 1fr;
  }
}

.play-chip {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--p-text-color);
  color: var(--p-content-background);
  display: grid;
  place-items: center;
  font-size: 16px;
  flex-shrink: 0;
}

.summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--p-content-border-color);
  font-size: 13px;
}

.summary li:last-child {
  border-bottom: 0;
}

.summary li .pi {
  font-size: 14px;
  color: var(--p-text-color-secondary);
  width: 18px;
  text-align: center;
}

.summary li strong {
  margin-left: auto;
  font-weight: 600;
}
</style>
