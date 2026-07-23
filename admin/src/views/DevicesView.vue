<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { useDevicesStore } from '../stores/useDevicesStore'
import { setPageMeta } from '../composables/useTopbar'
import PageBreadcrumb from '../components/common/PageBreadcrumb.vue'
import PageHeader from '../components/common/PageHeader.vue'
import type { Device, DeviceStatus } from '../api/devices'

setPageMeta({ title: 'デバイス' })

const devicesStore = useDevicesStore()
const toast = useToast()
const confirm = useConfirm()

// status は最終ハートビートからの経過時間で変わるため、表示中は定期再取得する
const POLL_INTERVAL_MS = 30_000
let pollTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  devicesStore.load()
  pollTimer = setInterval(() => devicesStore.reload(), POLL_INTERVAL_MS)
})

onUnmounted(() => {
  if (pollTimer !== undefined) clearInterval(pollTimer)
})

const devices = computed(() => devicesStore.devices)

// 登録ダイアログ

const createVisible = ref(false)
const createName = ref('')
const creating = ref(false)

// トークン表示ダイアログ（作成直後のみ）
const tokenVisible = ref(false)
const createdToken = ref('')
const createdName = ref('')

function openCreate() {
  createName.value = ''
  createVisible.value = true
}

async function submitCreate() {
  const name = createName.value.trim()
  if (!name) return
  creating.value = true
  try {
    const created = await devicesStore.create(name)
    createVisible.value = false
    createdToken.value = created.token
    createdName.value = created.device.name
    tokenVisible.value = true
  } catch (e) {
    toast.add({ severity: 'error', summary: '登録失敗', detail: String(e), life: 5000 })
  } finally {
    creating.value = false
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(createdToken.value)
    toast.add({ severity: 'success', summary: 'トークンをコピーしました', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'コピーに失敗しました', life: 3000 })
  }
}

function closeTokenDialog() {
  tokenVisible.value = false
  createdToken.value = ''
  createdName.value = ''
}

function removeDevice(device: Device) {
  confirm.require({
    message: `「${device.name}」を削除します。このデバイスのトークンは失効し、以降ハートビートは拒否されます。`,
    header: 'デバイスの削除',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '削除', severity: 'danger' },
    accept: async () => {
      try {
        await devicesStore.remove(device.id)
        toast.add({ severity: 'success', summary: 'デバイスを削除しました', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '削除失敗', detail: String(e), life: 5000 })
      }
    },
  })
}

// 表示ヘルパー

const STATUS_META: Record<DeviceStatus, { label: string; severity: string }> = {
  online: { label: 'オンライン', severity: 'success' },
  offline: { label: 'オフライン', severity: 'danger' },
  unknown: { label: '未接続', severity: 'secondary' },
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return `${diffSec}秒前`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`
  return `${Math.floor(diffSec / 86400)}日前`
}
</script>

<template>
  <div class="devices-view">
    <PageBreadcrumb :items="[{ label: 'デバイス' }]" />
    <PageHeader
      title="デバイス"
      description="サイネージ端末 (edge) の接続状態。各デバイスは発行されたトークンでハートビートを送信します"
    />

    <div class="toolbar mb-3">
      <span class="text-sm text-color-secondary">
        登録済み <strong class="tabular-nums">{{ devices.length }}</strong> 台
      </span>
      <div class="flex-grow-1" />
      <Button
        icon="pi pi-refresh"
        size="small"
        outlined
        severity="secondary"
        aria-label="再読み込み"
        v-tooltip.top="'再読み込み'"
        :loading="devicesStore.loading"
        @click="devicesStore.load()"
      />
      <Button label="デバイスを登録" icon="pi pi-plus" size="small" @click="openCreate" />
    </div>

    <div v-if="!devicesStore.loading && devices.length === 0" class="text-center text-color-secondary py-6">
      <i class="pi pi-desktop" style="font-size: 28px; opacity: 0.4" />
      <div class="mt-2">デバイスが登録されていません</div>
      <Button label="デバイスを登録" icon="pi pi-plus" class="mt-3" outlined size="small" @click="openCreate" />
    </div>

    <DataTable v-else :value="devices" :loading="devicesStore.loading" dataKey="id">
      <Column header="状態" style="width: 8rem">
        <template #body="{ data }">
          <Tag :value="STATUS_META[data.status as DeviceStatus].label" :severity="STATUS_META[data.status as DeviceStatus].severity" />
        </template>
      </Column>
      <Column field="name" header="名前">
        <template #body="{ data }">
          <span class="font-semibold">{{ data.name }}</span>
        </template>
      </Column>
      <Column header="最終ハートビート">
        <template #body="{ data }">
          <template v-if="data.lastHeartbeatAt">
            <span>{{ formatDateTime(data.lastHeartbeatAt) }}</span>
            <span class="text-xs text-color-secondary ml-2">({{ relativeTime(data.lastHeartbeatAt) }})</span>
          </template>
          <span v-else class="text-color-secondary">—</span>
        </template>
      </Column>
      <Column field="version" header="バージョン" style="width: 9rem">
        <template #body="{ data }">
          <span v-if="data.version">{{ data.version }}</span>
          <span v-else class="text-color-secondary">—</span>
        </template>
      </Column>
      <Column header="登録日" style="width: 11rem">
        <template #body="{ data }">
          {{ formatDateTime(data.createdAt) }}
        </template>
      </Column>
      <Column style="width: 4rem">
        <template #body="{ data }">
          <Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            aria-label="削除"
            @click="removeDevice(data)"
          />
        </template>
      </Column>
    </DataTable>

    <!-- 登録ダイアログ -->
    <Dialog v-model:visible="createVisible" header="デバイスを登録" modal :style="{ width: '26rem' }">
      <div class="flex flex-column gap-2">
        <label for="device-name" class="text-sm font-semibold">デバイス名</label>
        <InputText
          id="device-name"
          v-model="createName"
          placeholder="例: 沼津駅前 1F"
          autofocus
          @keyup.enter="submitCreate"
        />
        <small class="text-color-secondary">設置場所などが分かる名前を付けてください。</small>
      </div>
      <template #footer>
        <Button label="キャンセル" severity="secondary" outlined @click="createVisible = false" />
        <Button label="登録" :loading="creating" :disabled="!createName.trim()" @click="submitCreate" />
      </template>
    </Dialog>

    <!-- トークン表示ダイアログ（一度きり） -->
    <Dialog
      :visible="tokenVisible"
      header="デバイストークン"
      modal
      :closable="false"
      :style="{ width: '34rem' }"
    >
      <div class="flex flex-column gap-3">
        <Message severity="warn" :closable="false">
          このトークンは<strong>この画面でしか表示されません</strong>。閉じる前に必ず控えてください。
        </Message>
        <div class="text-sm">
          「{{ createdName }}」の edge の <code>.env</code> に以下を設定してください:
        </div>
        <div class="token-box">
          <code class="token-value">SIGNAGE_API_TOKEN={{ createdToken }}</code>
          <Button
            icon="pi pi-copy"
            text
            rounded
            severity="secondary"
            aria-label="トークンをコピー"
            v-tooltip.top="'コピー'"
            @click="copyToken"
          />
        </div>
      </div>
      <template #footer>
        <Button label="控えたので閉じる" @click="closeTokenDialog" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.token-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  background: var(--p-content-hover-background);
}

.token-value {
  flex: 1;
  font-size: 12px;
  word-break: break-all;
  user-select: all;
}
</style>
