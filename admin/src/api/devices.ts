import { apiFetch } from './client'

export type DeviceStatus = 'online' | 'offline' | 'unknown'

export interface Device {
  id: string
  name: string
  status: DeviceStatus
  lastHeartbeatAt: string | null
  version: string | null
  createdAt: string
}

export interface DevicesResponse {
  devices: Device[]
}

export interface CreatedDevice {
  device: Device
  // 平文トークンはこのレスポンスでのみ得られる（再取得不可）
  token: string
}

export async function fetchDevices(): Promise<DevicesResponse> {
  return apiFetch<DevicesResponse>('/devices')
}

export async function createDevice(name: string): Promise<CreatedDevice> {
  return apiFetch<CreatedDevice>('/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function deleteDevice(id: string): Promise<void> {
  await apiFetch<void>(`/devices/${id}`, { method: 'DELETE' })
}
