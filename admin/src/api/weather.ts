import { apiFetch } from './client'

export interface WeatherDay {
  date: string
  dayOffset: number
  weatherCode: number
  description: string
  tempMin: number | null
  tempMax: number | null
  tempCurrent: number | null
  pop: number
}

export interface WeatherData {
  days: WeatherDay[]
  fetchedAt: string | null
}

export async function fetchWeather(): Promise<WeatherData> {
  return apiFetch<WeatherData>('/weather')
}

export async function refreshWeather(): Promise<{ fetched: number }> {
  return apiFetch('/weather/refresh', { method: 'POST' })
}
