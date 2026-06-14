import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchWeather, refreshWeather, type WeatherDay } from '../api/weather'

export const useWeatherStore = defineStore('weather', () => {
  const days = ref<WeatherDay[]>([])
  const fetchedAt = ref<string | null>(null)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const data = await fetchWeather()
      days.value = data.days
      fetchedAt.value = data.fetchedAt
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    refreshing.value = true
    error.value = null
    try {
      await refreshWeather()
      const data = await fetchWeather()
      days.value = data.days
      fetchedAt.value = data.fetchedAt
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      throw e
    } finally {
      refreshing.value = false
    }
  }

  return { days, fetchedAt, loading, refreshing, error, load, refresh }
})
