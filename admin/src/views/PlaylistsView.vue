<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { usePlaylistsStore } from '../stores/usePlaylistsStore'

const store = usePlaylistsStore()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

onMounted(() => store.load())

const showCreateDialog = ref(false)
const newName = ref('')

function openCreateDialog() {
  newName.value = ''
  showCreateDialog.value = true
}

async function confirmCreate() {
  if (!newName.value.trim()) return
  try {
    await store.create(newName.value.trim())
    showCreateDialog.value = false
    toast.add({ severity: 'success', summary: 'プレイリストを作成しました', life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: '作成失敗', detail: String(e), life: 5000 })
  }
}

async function activate(id: string, name: string) {
  try {
    await store.activate(id)
    toast.add({ severity: 'success', summary: `「${name}」をアクティブにしました`, life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'アクティブ化失敗', detail: String(e), life: 5000 })
  }
}

function confirmDelete(id: string, name: string) {
  confirm.require({
    message: `「${name}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'キャンセル', severity: 'secondary', outlined: true },
    acceptProps: { label: '削除', severity: 'danger' },
    accept: async () => {
      try {
        await store.remove(id)
        toast.add({ severity: 'success', summary: '削除しました', life: 2000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: '削除失敗', detail: String(e), life: 5000 })
      }
    },
  })
}
</script>

<template>
  <div class="playlists-view">
    <div class="flex align-items-center justify-content-between mb-4">
      <h1 class="m-0 text-xl">プレイリスト管理</h1>
      <Button label="新規作成" icon="pi pi-plus" @click="openCreateDialog" />
    </div>

    <div v-if="store.loading" class="text-center text-color-secondary py-4">
      読み込み中...
    </div>
    <div v-else-if="store.playlists.length === 0" class="text-center text-color-secondary py-4">
      プレイリストがありません。
    </div>
    <div v-else class="flex flex-column gap-3">
      <Card
        v-for="playlist in store.playlists"
        :key="playlist.id"
        class="cursor-pointer"
        @click="router.push(`/playlists/${playlist.id}`)"
      >
        <template #content>
          <div class="flex flex-row align-items-center gap-3">
            <span class="pi pi-list text-4xl text-color-secondary" />
            <div class="flex flex-column gap-1 flex-grow-1">
              <div class="flex align-items-center gap-2">
                <span class="font-semibold">{{ playlist.name }}</span>
                <Tag v-if="playlist.isActive" value="アクティブ" severity="success" />
              </div>
              <span class="text-sm text-color-secondary">アイテム数: {{ playlist.itemCount }}</span>
            </div>
            <div class="flex align-items-center gap-1" @click.stop>
              <Button
                v-if="!playlist.isActive"
                label="アクティブにする"
                icon="pi pi-check-circle"
                size="small"
                text
                severity="success"
                @click="activate(playlist.id, playlist.name)"
              />
              <Button
                v-if="!playlist.isActive"
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                @click="confirmDelete(playlist.id, playlist.name)"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>

    <Dialog v-model:visible="showCreateDialog" header="新規プレイリスト作成" modal style="width: 24rem">
      <div class="flex flex-column gap-2 py-2">
        <label class="font-semibold text-sm">名前</label>
        <InputText v-model="newName" class="w-full" placeholder="プレイリスト名" @keyup.enter="confirmCreate" />
      </div>
      <template #footer>
        <Button label="キャンセル" text @click="showCreateDialog = false" />
        <Button label="作成" icon="pi pi-check" :disabled="!newName.trim()" @click="confirmCreate" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
</style>
