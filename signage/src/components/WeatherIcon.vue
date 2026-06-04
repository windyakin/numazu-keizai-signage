<script setup lang="ts">
import { computed } from "vue";
import { weatherCategory } from "../data/jmaTelops";

// 気象庁 天気予報用テロップ番号(weatherCode)から表示カテゴリを決める。
// 日次予報のため昼夜の区別は持たない。外部画像に依存せずオフラインで動かすため
// インライン SVG で描画する。
const props = defineProps<{
  weatherCode: number;
}>();

const category = computed(() => weatherCategory(props.weatherCode));

// 太陽の光線（8方向・均等）。中心 (0,0) 基準・内端→外端の向き。
const rayLines: { x1: number; y1: number; x2: number; y2: number }[] = [
  { x1: 0, y1: -15, x2: 0, y2: -22 }, // N
  { x1: 10.6, y1: -10.6, x2: 15.6, y2: -15.6 }, // NE
  { x1: 15, y1: 0, x2: 22, y2: 0 }, // E
  { x1: 10.6, y1: 10.6, x2: 15.6, y2: 15.6 }, // SE
  { x1: 0, y1: 15, x2: 0, y2: 22 }, // S
  { x1: -10.6, y1: 10.6, x2: -15.6, y2: 15.6 }, // SW
  { x1: -15, y1: 0, x2: -22, y2: 0 }, // W
  { x1: -10.6, y1: -10.6, x2: -15.6, y2: -15.6 }, // NW
];
</script>

<template>
  <svg
    class="weather-icon"
    viewBox="0 0 64 64"
    role="img"
    :aria-label="`weather-${category}`"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <!-- 共通の雲（3つのこぶ＋平らな底）。fill は使用側で指定する。
           ベースは上が平ら（円が覆って隠れる）・下の角だけ丸いパスにして
           側面に余計なふくらみが出ないようにする。左右端は外側の円とそろえる。 -->
      <g id="wi-cloud">
        <circle cx="24" cy="31" r="8" />
        <circle cx="34" cy="26" r="12" />
        <circle cx="43" cy="31" r="9" />
        <path d="M16 31H52V32a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" />
      </g>
    </defs>

    <!-- 晴れ: 太陽 -->
    <g v-if="category === 'clear'">
      <!-- 回転は親 <g>、光線の伸縮は内側 <g> に分離（周期・緩急が別なため）。 -->
      <g class="sun-rays sun-rays--day">
        <g
          transform="translate(32 32)"
          stroke="#ffd54a"
          stroke-width="3"
          stroke-linecap="round"
        >
          <line
            v-for="(r, i) in rayLines"
            :key="i"
            class="ray"
            :x1="r.x1"
            :y1="r.y1"
            :x2="r.x2"
            :y2="r.y2"
          />
        </g>
      </g>
      <circle cx="32" cy="32" r="12" fill="#ffd54a" />
    </g>

    <!-- くもり: 雲を2枚重ねる -->
    <g v-else-if="category === 'cloudy'">
      <!-- 位置決め transform は親 <g> に。子 <use> は CSS のドリフトだけ受け持つ -->
      <g transform="translate(-7 7) scale(0.8)">
        <use class="cloud-drift cloud-drift--alt" href="#wi-cloud" fill="#cfd8e0" />
      </g>
      <use class="cloud-drift" href="#wi-cloud" fill="#eef3f7" />
    </g>

    <!-- 雨 -->
    <g v-else-if="category === 'rain'">
      <use class="cloud-drift" href="#wi-cloud" fill="#cfd8e0" />
      <g stroke="#4aa3e0" stroke-width="3" stroke-linecap="round">
        <line class="raindrop" x1="25" y1="47" x2="22" y2="55" />
        <line class="raindrop" x1="34" y1="47" x2="31" y2="55" />
        <line class="raindrop" x1="43" y1="47" x2="40" y2="55" />
      </g>
    </g>

    <!-- 雷 -->
    <g v-else-if="category === 'thunder'">
      <use class="cloud-drift" href="#wi-cloud" fill="#b9c4cf" />
      <path class="bolt" d="M34 45l-9 11h6l-3 8 10-12h-6l5-7z" fill="#ffd54a" />
    </g>

    <!-- 雪 -->
    <g v-else-if="category === 'snow'">
      <use class="cloud-drift" href="#wi-cloud" fill="#dfe7ee" />
      <g fill="#ffffff">
        <circle class="snowflake" cx="25" cy="51" r="2.6" />
        <circle class="snowflake" cx="34" cy="54" r="2.6" />
        <circle class="snowflake" cx="43" cy="51" r="2.6" />
      </g>
    </g>

    <!-- フォールバック -->
    <circle v-else cx="32" cy="32" r="12" fill="#ffd54a" />
  </svg>
</template>

<style scoped>
.weather-icon {
  width: 100%;
  height: 100%;
  display: block;
}

/* 太陽: 芯は固定。光線は中心を軸にゆっくり回転（親 <g>）しつつ、
   内端（中央側）を固定したまま外へ向かって長さが伸縮する。
   伸縮は stroke-dashoffset で外端側を隠して表現（最大長は固定なので領域は不変）。
   両端で止まって見えないよう、タイミングはサイン波を細かくサンプリングした
   キーフレーム＋linear にして、伸び→縮み→伸びを連続的に流す。 */
.sun-rays {
  transform-box: view-box;
  animation: sun-spin 16s linear infinite;
}
.sun-rays--day {
  transform-origin: 32px 32px;
}
.ray {
  stroke-dasharray: 8; /* 線長(7〜7.1)より少し長く取り、offset 0 で全長表示 */
  animation: ray-pulse 3s linear infinite;
}
@keyframes sun-spin {
  to {
    transform: rotate(360deg);
  }
}
/* offset = 1.75 * (1 - cos(2πt))。0(全長)↔3.5(短) をサインで往復 */
@keyframes ray-pulse {
  0% {
    stroke-dashoffset: 0;
  }
  10% {
    stroke-dashoffset: 0.33;
  }
  20% {
    stroke-dashoffset: 1.21;
  }
  30% {
    stroke-dashoffset: 2.29;
  }
  40% {
    stroke-dashoffset: 3.17;
  }
  50% {
    stroke-dashoffset: 3.5;
  }
  60% {
    stroke-dashoffset: 3.17;
  }
  70% {
    stroke-dashoffset: 2.29;
  }
  80% {
    stroke-dashoffset: 1.21;
  }
  90% {
    stroke-dashoffset: 0.33;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

/* 雲: 左右にゆっくりドリフト（平行移動なので回転軸は不要） */
.cloud-drift {
  animation: cloud-drift 6s ease-in-out infinite;
}
.cloud-drift--alt {
  animation-duration: 7.5s;
  animation-direction: reverse;
}
@keyframes cloud-drift {
  0%,
  100% {
    transform: translateX(-1.5px);
  }
  50% {
    transform: translateX(1.5px);
  }
}

/* 雨: しずくが落ちて消える。3 本をずらして連続感を出す */
.raindrop {
  animation: raindrop 1.1s ease-in infinite;
}
.raindrop:nth-of-type(2) {
  animation-delay: 0.37s;
}
.raindrop:nth-of-type(3) {
  animation-delay: 0.73s;
}
@keyframes raindrop {
  0% {
    transform: translateY(-6px);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translateY(6px);
    opacity: 0;
  }
}

/* 雷: 稲妻が時々ピカッと光る */
.bolt {
  animation: bolt-flash 2.4s steps(1, end) infinite;
}
@keyframes bolt-flash {
  0%,
  18%,
  26%,
  100% {
    opacity: 1;
  }
  20%,
  24% {
    opacity: 0.15;
  }
}

/* 雪: ふわふわ落ちる */
.snowflake {
  animation: snowfall 2.6s ease-in-out infinite;
}
.snowflake:nth-of-type(2) {
  animation-delay: 0.5s;
}
.snowflake:nth-of-type(3) {
  animation-delay: 1s;
}
@keyframes snowfall {
  0% {
    transform: translate(0, -5px);
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    transform: translate(2px, 6px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sun-rays,
  .ray,
  .cloud-drift,
  .raindrop,
  .snowflake,
  .bolt {
    animation: none;
  }
}
</style>
