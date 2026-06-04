export interface WeatherDay {
  date: string; // "YYYY-MM-DD" (JST)
  dayOffset: number; // 0=今日, 1=明日, ...
  weatherCode: number; // 気象庁 天気予報用テロップ番号（1xx 晴 / 2xx 曇 / 3xx 雨 / 4xx 雪）
  description: string;
  tempMin: number | null; // 気象庁が値を持たない場合は null
  tempMax: number | null;
  tempCurrent: number | null; // アメダス現在気温（今日のみ）
  pop: number; // 降水確率 0..1
}

export interface WeatherData {
  days: WeatherDay[];
  fetchedAt: string | null;
}

interface WeatherResponse {
  days: WeatherDay[];
  fetchedAt: string | null;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8080/api";

export async function fetchWeather(): Promise<WeatherData> {
  const res = await fetch(`${API_BASE_URL}/signage/weather`);
  if (!res.ok) {
    throw new Error(`Failed to fetch weather: ${res.status}`);
  }
  const data: WeatherResponse = await res.json();
  return { days: data.days, fetchedAt: data.fetchedAt };
}
