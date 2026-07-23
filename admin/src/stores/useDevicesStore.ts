import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createDevice,
  deleteDevice,
  fetchDevices,
  type CreatedDevice,
  type Device,
} from '../api/devices'

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Device[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const data = await fetchDevices()
      devices.value = data.devices
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  // status はサーバー側で導出されるため、表示更新はサイレントに再取得する
  async function reload() {
    try {
      const data = await fetchDevices()
      devices.value = data.devices
    } catch {
      // ポーリング失敗は無視（次回の再取得に任せる）
    }
  }

  async function create(name: string): Promise<CreatedDevice> {
    const created = await createDevice(name)
    await load()
    return created
  }

  async function remove(id: string) {
    await deleteDevice(id)
    devices.value = devices.value.filter((d) => d.id !== id)
  }

  return { devices, loading, error, load, reload, create, remove }
})
