<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { DataTablePageEvent } from 'primevue/datatable'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Panel from 'primevue/panel'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Tag from 'primevue/tag'
import { useArticlesStore } from '../stores/useArticlesStore'
import { useRankingsStore } from '../stores/useRankingsStore'
import { setPageMeta } from '../composables/useTopbar'
import PageBreadcrumb from '../components/common/PageBreadcrumb.vue'
import PageHeader from '../components/common/PageHeader.vue'
import Thumb from '../components/common/Thumb.vue'

setPageMeta({ title: 'ニュース' })

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/admin'

// signage 経由 (/api/signage/media) は edge ↔ api 認証で保護されたため、
// ブラウザからは未保護な admin 経路で storageKey を引いてサムネ表示する。
function articleImageUrl(imageKey: string | null): string | null {
  if (!imageKey) return null
  return `${BASE_URL}/media/by-key?key=${encodeURIComponent(imageKey)}`
}

const articlesStore = useArticlesStore()
const rankingsStore = useRankingsStore()
const toast = useToast()
const confirm = useConfirm()

const first = ref(0)
const rows = ref(20)

onMounted(() => {
  articlesStore.loadPage(first.value, rows.value)
  rankingsStore.load()
})

function onPage(event: DataTablePageEvent) {
  first.value = event.first
  rows.value = event.rows
  articlesStore.loadPage(event.first, event.rows)
}

const sortedRankings = computed(() => [...rankingsStore.rankings].sort((a, b) => a.rank - b.rank))

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function refreshArticles() {
  confirm.require({
    message: 'ニュース配信サイトから記事一覧を取得し直します（時間がかかる場合があります）。',
    header: '記事の再取得',
    icon: 'pi pi-refresh',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '再取得' },
    accept: async () => {
      try {
        await articlesStore.refresh()
        toast.add({ severity: 'success', summary: '記事を再取得しました', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '再取得失敗', detail: String(e), life: 5000 })
      }
    },
  })
}

function refreshRankings() {
  confirm.require({
    message: 'ニュース配信サイトからアクセスランキングを取得し直します（時間がかかる場合があります）。',
    header: 'ランキングの再取得',
    icon: 'pi pi-refresh',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '再取得' },
    accept: async () => {
      try {
        await rankingsStore.refresh()
        toast.add({ severity: 'success', summary: 'ランキングを再取得しました', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '再取得失敗', detail: String(e), life: 5000 })
      }
    },
  })
}

function rankSeverity(rank: number): 'success' | 'info' | 'warn' | 'secondary' {
  if (rank === 1) return 'warn'
  if (rank <= 3) return 'success'
  if (rank <= 10) return 'info'
  return 'secondary'
}
</script>

<template>
  <div class="articles-view">
    <PageBreadcrumb :items="[{ label: 'ニュース' }]" />
    <PageHeader title="ニュース" description="サイネージに配信中の記事キャッシュとアクセスランキング" />

    <Panel :pt="{ header: { class: 'hidden' }, content: { class: 'p-0' } }" class="overflow-hidden">
      <Tabs value="articles">
        <TabList>
          <Tab value="articles">
            <span class="flex align-items-center gap-2">
              <i class="pi pi-file" />
              <span>記事</span>
              <span class="text-xs text-color-secondary tabular-nums">{{ articlesStore.total }}</span>
            </span>
          </Tab>
          <Tab value="rankings">
            <span class="flex align-items-center gap-2">
              <i class="pi pi-chart-bar" />
              <span>アクセスランキング</span>
              <span class="text-xs text-color-secondary tabular-nums">{{ rankingsStore.rankings.length }}</span>
            </span>
          </Tab>
        </TabList>

        <TabPanels>
          <!-- Articles -->
          <TabPanel value="articles">
            <div class="toolbar mb-3">
              <span class="text-sm text-color-secondary">
                取得済み <strong class="tabular-nums">{{ articlesStore.total }}</strong> 件
              </span>
              <div class="flex-grow-1" />
              <Button
                label="再取得"
                icon="pi pi-refresh"
                size="small"
                outlined
                :loading="articlesStore.refreshing"
                @click="refreshArticles"
              />
            </div>

            <div class="description mb-3">
              <span>
                このうち最新15件がランダムに選ばれてサイネージに配信されます。
              </span>
            </div>

            <DataTable
              :value="articlesStore.articles"
              :loading="articlesStore.loading"
              data-key="id"
              striped-rows
              lazy
              paginator
              :first="first"
              :rows="rows"
              :total-records="articlesStore.total"
              :rows-per-page-options="[20, 50, 100]"
              @page="onPage"
            >
              <template #empty>
                <div class="text-center text-color-secondary py-5">
                  <i class="pi pi-inbox" style="font-size: 28px; opacity: 0.4" />
                  <div class="mt-2">記事がありません</div>
                  <Button label="再取得" icon="pi pi-refresh" class="mt-3" outlined size="small" @click="refreshArticles" />
                </div>
              </template>

              <Column header="画像" :style="{ width: '110px' }">
                <template #body="{ data }">
                  <Thumb
                    :src="articleImageUrl(data.imageKey)"
                    :alt="data.title"
                    kind="IMAGE"
                    :width="88"
                    :height="66"
                    :rounded="6"
                  />
                </template>
              </Column>
              <Column field="title" header="タイトル">
                <template #body="{ data }">
                  <div class="title-cell">
                    <a
                      v-if="data.articleUrl"
                      class="title title-link"
                      :href="data.articleUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ data.title }}
                      <i class="pi pi-external-link external-icon" />
                    </a>
                    <div v-else class="title">{{ data.title }}</div>
                    <div v-if="data.description" class="description">{{ data.description }}</div>
                  </div>
                </template>
              </Column>
              <Column field="start" header="公開日時" :style="{ width: '170px' }">
                <template #body="{ data }">
                  <span class="text-sm tabular-nums">{{ formatDateTime(data.start) }}</span>
                </template>
              </Column>
            </DataTable>
          </TabPanel>

          <!-- Rankings -->
          <TabPanel value="rankings">
            <div class="toolbar mb-3">
              <span class="text-sm text-color-secondary">
                取得済み <strong class="tabular-nums">{{ rankingsStore.rankings.length }}</strong> 件
                <template v-if="rankingsStore.fetchedAt">
                  <span class="mx-2">·</span>
                  <span>更新 {{ formatDateTime(rankingsStore.fetchedAt) }}</span>
                </template>
              </span>
              <div class="flex-grow-1" />
              <Button
                label="再取得"
                icon="pi pi-refresh"
                size="small"
                outlined
                :loading="rankingsStore.refreshing"
                @click="refreshRankings"
              />
            </div>

            <div class="description mb-3">
              <span>
                このうち上位5件がサイネージで表示されます。
              </span>
            </div>

            <DataTable
              :value="sortedRankings"
              :loading="rankingsStore.loading"
              data-key="id"
              striped-rows
            >
              <template #empty>
                <div class="text-center text-color-secondary py-5">
                  <i class="pi pi-chart-bar" style="font-size: 28px; opacity: 0.4" />
                  <div class="mt-2">ランキングがありません</div>
                  <Button label="再取得" icon="pi pi-refresh" class="mt-3" outlined size="small" @click="refreshRankings" />
                </div>
              </template>

              <Column field="rank" :style="{ width: '80px' }" sortable>
                <template #body="{ data }">
                  <Tag :value="`${data.rank}位`" :severity="rankSeverity(data.rank)" />
                </template>
              </Column>
              <Column header="画像" :style="{ width: '110px' }">
                <template #body="{ data }">
                  <Thumb
                    :src="articleImageUrl(data.imageKey)"
                    :alt="data.title"
                    kind="IMAGE"
                    :width="88"
                    :height="66"
                    :rounded="6"
                  />
                </template>
              </Column>
              <Column field="title" header="タイトル" sortable>
                <template #body="{ data }">
                  <div class="title-cell">
                    <a
                      v-if="data.articleUrl"
                      class="title title-link"
                      :href="data.articleUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ data.title }}
                      <i class="pi pi-external-link external-icon" />
                    </a>
                    <div v-else class="title">{{ data.title }}</div>
                  </div>
                </template>
              </Column>
              <Column field="start" header="公開日時" :style="{ width: '170px' }" sortable>
                <template #body="{ data }">
                  <span class="text-sm tabular-nums">{{ formatDateTime(data.start) }}</span>
                </template>
              </Column>
            </DataTable>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Panel>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.title-cell {
  min-width: 0;
}

.title {
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.4;
}

.title-link {
  color: var(--p-primary-color);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.title-link:hover {
  text-decoration: underline;
}

.external-icon {
  font-size: 11px;
  opacity: 0.6;
}

.description {
  font-size: 12px;
  color: var(--p-text-color-secondary);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
