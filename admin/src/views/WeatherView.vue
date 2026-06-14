<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import { useWeatherStore } from '../stores/useWeatherStore'
import { setPageMeta } from '../composables/useTopbar'
import PageBreadcrumb from '../components/common/PageBreadcrumb.vue'
import PageHeader from '../components/common/PageHeader.vue'
import type { WeatherDay } from '../api/weather'

setPageMeta({ title: '天気' })

const weatherStore = useWeatherStore()
const toast = useToast()
const confirm = useConfirm()

onMounted(() => {
  weatherStore.load()
})

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// "YYYY-MM-DD" を JST のローカル Date として解釈する
function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map((v) => parseInt(v, 10))
  return new Date(y, m - 1, d)
}

function dayLabel(day: WeatherDay): string {
  if (day.dayOffset === 0) return '今日'
  if (day.dayOffset === 1) return '明日'
  return `${parseDate(day.date).getMonth() + 1}/${parseDate(day.date).getDate()}`
}

function weekdayLabel(date: string): string {
  return WEEKDAYS[parseDate(date).getDay()]
}

// 気象庁テロップ番号の百の位で天気種別を判定し絵文字に対応づける
function weatherEmoji(code: number): string {
  const category = Math.floor(code / 100)
  if (category === 1) return '☀️'
  if (category === 2) return '☁️'
  if (category === 3) return '🌧️'
  if (category === 4) return '❄️'
  return '🌡️'
}

function roundTemp(t: number | null): string {
  return t == null ? '—' : String(Math.round(t))
}

function popPercent(pop: number): number {
  return Math.round(pop * 100)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const days = computed(() => weatherStore.days)

function refreshWeather() {
  confirm.require({
    message: '気象庁から天気予報を取得し直します。',
    header: '天気の再取得',
    icon: 'pi pi-refresh',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '再取得' },
    accept: async () => {
      try {
        await weatherStore.refresh()
        toast.add({ severity: 'success', summary: '天気を再取得しました', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '再取得失敗', detail: String(e), life: 5000 })
      }
    },
  })
}
</script>

<template>
  <div class="weather-view">
    <PageBreadcrumb :items="[{ label: '天気' }]" />
    <PageHeader title="天気" description="サイネージに配信中の天気予報キャッシュ（出典: 気象庁 防災情報XML）" />

    <div class="toolbar mb-3">
      <span class="text-sm text-color-secondary">
        取得済み <strong class="tabular-nums">{{ days.length }}</strong> 日分
        <template v-if="weatherStore.fetchedAt">
          <span class="mx-2">·</span>
          <span>更新 {{ formatDateTime(weatherStore.fetchedAt) }}</span>
        </template>
      </span>
      <div class="flex-grow-1" />
      <Button
        label="再取得"
        icon="pi pi-refresh"
        size="small"
        outlined
        :loading="weatherStore.refreshing"
        @click="refreshWeather"
      />
    </div>

    <div v-if="!weatherStore.loading && days.length === 0" class="text-center text-color-secondary py-6">
      <i class="pi pi-cloud" style="font-size: 28px; opacity: 0.4" />
      <div class="mt-2">天気予報がありません</div>
      <Button label="再取得" icon="pi pi-refresh" class="mt-3" outlined size="small" @click="refreshWeather" />
    </div>

    <div v-else class="weather-grid">
      <Card
        v-for="day in days"
        :key="day.date"
        :pt="{ body: { class: 'p-0' }, content: { class: 'p-0' } }"
        class="weather-card"
      >
        <template #content>
          <div class="day-card">
            <div class="day-head">
              <span class="day-label">{{ dayLabel(day) }}</span>
              <Tag
                v-if="day.dayOffset <= 1"
                :value="`${parseDate(day.date).getMonth() + 1}/${parseDate(day.date).getDate()}(${weekdayLabel(day.date)})`"
                severity="secondary"
              />
              <span v-else class="day-weekday">({{ weekdayLabel(day.date) }})</span>
            </div>

            <div class="day-emoji" :title="`気象コード ${day.weatherCode}`">{{ weatherEmoji(day.weatherCode) }}</div>
            <div class="day-desc">{{ day.description }}</div>

            <div class="day-temps">
              <span class="temp-max">{{ roundTemp(day.tempMax) }}°</span>
              <span class="temp-sep">/</span>
              <span class="temp-min">{{ roundTemp(day.tempMin) }}°</span>
            </div>
            <div v-if="day.tempCurrent !== null" class="day-current">
              現在 {{ roundTemp(day.tempCurrent) }}°
            </div>

            <div class="day-pop">☔ {{ popPercent(day.pop) }}%</div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.weather-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.day-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 12px;
  text-align: center;
}

.day-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.day-label {
  font-size: 16px;
  font-weight: 700;
}

.day-weekday {
  font-size: 12px;
  color: var(--p-text-color-secondary);
}

.day-emoji {
  font-size: 44px;
  line-height: 1;
}

.day-desc {
  font-size: 14px;
  font-weight: 600;
}

.day-temps {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-weight: 700;
}

.temp-max {
  font-size: 22px;
  color: #e8590c;
}

.temp-min {
  font-size: 18px;
  color: #1c7ed6;
}

.temp-sep {
  color: var(--p-text-color-secondary);
}

.day-current {
  font-size: 12px;
  color: var(--p-text-color-secondary);
}

.day-pop {
  font-size: 13px;
  color: #1c7ed6;
}
</style>
