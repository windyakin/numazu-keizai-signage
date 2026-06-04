<script setup lang="ts">
import { computed } from "vue";
import type { WeatherDay } from "../../api/weather";
import WeatherIcon from "../WeatherIcon.vue";

const props = defineProps<{
  days: WeatherDay[];
  fetchedAt: string | null;
}>();

// 上半分: 今日・明日（先頭2件）
const featured = computed(() => props.days.slice(0, 2));
// 右 1/3: 週間（今日・明日は大カードに出ているので明後日以降、2x2 で最大4日）
const week = computed(() => props.days.slice(2, 6));

const fetchedHour = computed(() => {
  if (!props.fetchedAt) return null;
  return new Date(props.fetchedAt).getHours();
});

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// "YYYY-MM-DD" を JST のローカル Date として解釈する
function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map((v) => parseInt(v, 10));
  return new Date(y, m - 1, d);
}

function featuredLabel(day: WeatherDay): string {
  if (day.dayOffset === 0) return "今日";
  if (day.dayOffset === 1) return "明日";
  return weekdayLabel(day.date);
}

function monthDay(date: string): string {
  const d = parseDate(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weekdayLabel(date: string): string {
  return WEEKDAYS[parseDate(date).getDay()];
}

function weekdayClass(date: string): string {
  const day = parseDate(date).getDay();
  if (day === 0) return "weather-slide__wday--sun";
  if (day === 6) return "weather-slide__wday--sat";
  return "";
}

function popPercent(pop: number): number {
  return Math.round(pop * 100);
}

// 気象庁が気温を持たない日（当日の夕方発表など）は null。その場合は "—" を表示する。
function roundTemp(t: number | null): string {
  return t == null ? "—" : String(Math.round(t));
}

// 天気文の「後」を小さい「のち」として描画するためにトークン分割する。
// 例: "くもり後雨" → [{text:"くもり"}, {nochi:true}, {text:"雨"}]
function descParts(desc: string): { text?: string; nochi?: boolean }[] {
  const parts: { text?: string; nochi?: boolean }[] = [];
  desc.split("後").forEach((seg, i) => {
    if (i > 0) parts.push({ nochi: true });
    if (seg) parts.push({ text: seg });
  });
  return parts;
}
</script>

<template>
  <div class="weather-slide">
    <div class="weather-slide__header">
      <h2 class="weather-slide__title">
        沼津の天気
        <span v-if="fetchedHour !== null" class="weather-slide__fetched">（{{ fetchedHour }}時更新）</span>
      </h2>
      <span class="weather-slide__credit-source">出典: 気象庁 防災情報XML</span>
    </div>

    <div class="weather-slide__main">
      <div
        v-for="(day, i) in featured"
        :key="day.date"
        class="weather-slide__feature-card"
        :style="{ animationDelay: `${i * 0.12}s` }"
      >
        <div class="weather-slide__feature-day">
          <span class="weather-slide__feature-label">{{ featuredLabel(day) }}</span>
          <span class="weather-slide__feature-date">{{ monthDay(day.date) }}({{ weekdayLabel(day.date) }})</span>
        </div>
        <div class="weather-slide__feature-icon">
          <WeatherIcon :weather-code="day.weatherCode" />
        </div>
        <div class="weather-slide__feature-desc">
          <template v-for="(part, i) in descParts(day.description)" :key="i">
            <span v-if="part.nochi" class="weather-slide__desc-nochi">のち</span>
            <template v-else>{{ part.text }}</template>
          </template>
        </div>
        <div class="weather-slide__feature-temps">
          <!-- 最高・最低が両方そろう日（明日以降）は予報の最高/最低を表示。
               今日のように欠ける場合はアメダスの現在気温を表示する。 -->
          <template v-if="day.tempMax !== null && day.tempMin !== null">
            <span class="weather-slide__temp-max">{{ roundTemp(day.tempMax) }}°</span>
            <span class="weather-slide__temp-sep">/</span>
            <span class="weather-slide__temp-min">{{ roundTemp(day.tempMin) }}°</span>
          </template>
          <span v-else-if="day.tempCurrent !== null" class="weather-slide__temp-current">
            {{ roundTemp(day.tempCurrent) }}°
          </span>
          <span v-else-if="day.tempMax !== null" class="weather-slide__temp-max">
            {{ roundTemp(day.tempMax) }}°
          </span>
          <span v-else class="weather-slide__temp-current">—</span>
        </div>
        <div class="weather-slide__feature-pop">
          <i class="weather-slide__pop-icon">☔</i>{{ popPercent(day.pop) }}%
        </div>
      </div>

      <div class="weather-slide__week">
        <div
          v-for="(day, i) in week"
          :key="day.date"
          class="weather-slide__week-day"
          :style="{ animationDelay: `${0.3 + i * 0.08}s` }"
        >
          <div class="weather-slide__week-head">
            <span class="weather-slide__week-wday" :class="weekdayClass(day.date)">
              {{ weekdayLabel(day.date) }}
            </span>
            <span class="weather-slide__week-date">{{ monthDay(day.date) }}</span>
          </div>
          <div class="weather-slide__week-icon">
            <WeatherIcon :weather-code="day.weatherCode" />
          </div>
          <div class="weather-slide__week-temps">
            <span class="weather-slide__temp-max">{{ roundTemp(day.tempMax) }}°</span>
            <span class="weather-slide__temp-min">{{ roundTemp(day.tempMin) }}°</span>
          </div>
          <span class="weather-slide__week-pop">{{ popPercent(day.pop) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weather-slide {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-primary-dark);
  overflow: hidden;
}

.weather-slide__header {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: max(1vh, 1vw);
  padding: max(1.5vh, 1.5vw) var(--slide-padding-x);
  background: var(--color-text);
}

.weather-slide__title {
  font-size: max(2.5vh, 2.5vw);
  font-weight: 700;
  color: var(--color-primary-dark);
}

.weather-slide__fetched {
  font-size: max(2vh, 2vw);
  font-weight: 400;
  color: var(--color-primary);
}

/* メイン: 今日 / 明日 / 週間2x2 を横3分割 */
.weather-slide__main {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
}

.weather-slide__main > * {
  flex: 1 1 0;
  min-width: 0;
}

.weather-slide__feature-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: max(1vh, 1vw);
  padding: max(1.5vh, 1.5vw);
  animation: weather-fade-in 0.5s ease both;
}

.weather-slide__feature-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: max(0.2vh, 0.2vw);
}

.weather-slide__feature-label {
  font-size: max(3vh, 3vw);
  font-weight: 700;
  color: var(--color-text);
}

.weather-slide__feature-date {
  font-size: max(1.4vh, 1.4vw);
  color: var(--color-text-muted);
}

.weather-slide__feature-icon {
  width: min(30vh, 30vw);
  height: min(30vh, 30vw);
}

.weather-slide__feature-desc {
  font-size: max(2vh, 2vw);
  font-weight: 600;
  color: var(--color-text);
}

/* 「後」は小さい「のち」で表示する */
.weather-slide__desc-nochi {
  font-size: 0.65em;
  margin: 0 0.1em;
}

.weather-slide__feature-temps {
  display: flex;
  align-items: baseline;
  gap: max(0.6vh, 0.6vw);
  font-weight: 700;
}

.weather-slide__feature-temps .weather-slide__temp-max {
  font-size: max(4vh, 4vw);
}

.weather-slide__feature-temps .weather-slide__temp-min {
  font-size: max(3vh, 3vw);
}

.weather-slide__temp-sep {
  font-size: max(2.4vh, 2.4vw);
  color: var(--color-text-muted);
}

.weather-slide__temp-max {
  color: #ff9d6b;
}

.weather-slide__temp-min {
  color: #7fc4ff;
}

.weather-slide__temp-current {
  font-size: max(3.4vh, 3.4vw);
  font-weight: 700;
  color: var(--color-text);
}

.weather-slide__feature-pop {
  font-size: max(1.8vh, 1.8vw);
  color: var(--color-text);
}

.weather-slide__pop-icon {
  font-style: normal;
  margin-right: 0.3em;
}

/* 右 1/3: 週間（2カラムで折り返し。4日=2x2 / 3日=2・1） */
.weather-slide__week {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
  gap: 1px;
  min-height: 0;
  background: var(--color-border);
}

/* 枚数が奇数で最後に余った1枚は下段で横いっぱいに（2・1 レイアウト） */
.weather-slide__week-day:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.weather-slide__week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: max(0.6vh, 0.6vw);
  padding: max(0.8vh, 0.8vw);
  min-width: 0;
  background: var(--color-primary);
  animation: weather-fade-in 0.5s ease both;
}

.weather-slide__week-head {
  display: flex;
  align-items: baseline;
  gap: max(0.6vh, 0.6vw);
}

.weather-slide__week-wday {
  font-size: max(2.2vh, 2.2vw);
  font-weight: 700;
  color: var(--color-text);
}

.weather-slide__week-wday--sun {
  color: #ff8a8a;
}

.weather-slide__week-wday--sat {
  color: #8ac6ff;
}

.weather-slide__week-date {
  font-size: max(1.5vh, 1.5vw);
  color: var(--color-text-muted);
}

.weather-slide__week-icon {
  width: min(14vh, 14vw);
  height: min(14vh, 14vw);
}

.weather-slide__week-temps {
  display: flex;
  align-items: baseline;
  gap: max(0.6vh, 0.6vw);
  font-weight: 700;
}

.weather-slide__week-temps .weather-slide__temp-max {
  font-size: max(2.4vh, 2.4vw);
}

.weather-slide__week-temps .weather-slide__temp-min {
  font-size: max(2vh, 2vw);
}

.weather-slide__week-pop {
  font-size: max(1.5vh, 1.5vw);
  color: #cfe8ff;
}

/* ヘッダー右端の出典クレジット */
.weather-slide__credit-source {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: max(1.3vh, 1.3vw);
  font-weight: 400;
  color: var(--color-primary-dark);
  letter-spacing: 0.02em;
}

/* 縦画面: 従来の上下レイアウト（今日・明日を上段に横並び、週間を下段の横ストリップ） */
@media (orientation: portrait) {
  .weather-slide__main {
    flex-wrap: wrap;
    align-content: stretch;
  }

  /* 今日・明日を上段に 50% ずつ横並び */
  .weather-slide__feature-card {
    flex: 1 1 50%;
  }

  /* 週間は下段に回り込み、枚数ぶんを横1列で等分（4日=4等分 / 3日=3等分） */
  .weather-slide__week {
    flex: 1 1 100%;
    grid-template-columns: none;
    grid-template-rows: 1fr;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
  }

  /* 横1列なので 2・1 の横長スパンは解除 */
  .weather-slide__week-day:last-child:nth-child(odd) {
    grid-column: auto;
  }
}

@keyframes weather-fade-in {
  from {
    transform: translateY(12%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
