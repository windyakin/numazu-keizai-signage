<script setup lang="ts">
// 開発用: WeatherIcon の全カテゴリ・全アニメーションを一覧プレビューする。
// 本番ビルドには含めず、`npm run dev` から weather-icons.html で開く。
import { ref } from "vue";
import WeatherIcon from "../components/WeatherIcon.vue";

type Sample = {
  label: string;
  weatherCode: number;
};

// WeatherIcon の category 分岐（clear/cloudy/rain/snow/thunder）を網羅する
// 気象庁 天気予報用テロップ番号の代表値。
const samples: Sample[] = [
  { label: "晴れ", weatherCode: 100 },
  { label: "晴時々曇", weatherCode: 101 },
  { label: "曇り", weatherCode: 200 },
  { label: "曇一時雨", weatherCode: 202 },
  { label: "雨", weatherCode: 300 },
  { label: "雨後曇", weatherCode: 313 },
  { label: "雪", weatherCode: 400 },
  { label: "雪か雨", weatherCode: 340 },
  { label: "雨で雷を伴う", weatherCode: 350 },
  { label: "雪で雷を伴う", weatherCode: 450 },
];

const dark = ref(true);
</script>

<template>
  <div class="gallery" :class="{ 'gallery--dark': dark }">
    <header class="gallery-bar">
      <h1>WeatherIcon プレビュー</h1>
      <label class="toggle">
        <input type="checkbox" v-model="dark" />
        暗い背景
      </label>
    </header>

    <div class="grid">
      <figure v-for="s in samples" :key="s.label" class="tile">
        <div class="icon-box">
          <WeatherIcon :weather-code="s.weatherCode" />
        </div>
        <figcaption>
          <span class="name">{{ s.label }}</span>
          <span class="meta">code: {{ s.weatherCode }}</span>
        </figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  min-height: 100vh;
  padding: 2rem;
  font-family: system-ui, sans-serif;
  background: #f4f6f9;
  color: #1c2530;
}
.gallery--dark {
  background: #18202b;
  color: #e6edf3;
}

.gallery-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}
.gallery-bar h1 {
  font-size: 1.25rem;
  margin: 0;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1.25rem;
}

.tile {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.08);
  border: 1px solid rgba(127, 127, 127, 0.18);
}

.icon-box {
  width: 120px;
  height: 120px;
}

figcaption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  text-align: center;
}
.name {
  font-weight: 600;
}
.meta {
  font-size: 0.8rem;
  opacity: 0.65;
}
</style>
