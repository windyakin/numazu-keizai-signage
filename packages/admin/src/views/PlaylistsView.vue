<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { usePlaylistsStore } from '../stores/usePlaylistsStore'

const store = usePlaylistsStore()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

onMounted(() => store.load())

// 新規作成
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

// アクティブ化
async function activate(id: string, name: string) {
  try {
    await store.activate(id)
    toast.add({ severity: 'success', summary: `「${name}」をアクティブにしました`, life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'アクティブ化失敗', detail: String(e), life: 5000 })
  }
}

// 削除
function confirmDelete(id: string, name: string) {
  confirm.require({
    message: `「${name}」を削除しますか？`,
    header: '削除の確認',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '削除',
    rejectLabel: 'キャンセル',
    acceptClass: 'p-button-danger',
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
    <div class="header">
      <h1>プレイリスト管理</h1>
      <Button label="新規作成" icon="pi pi-plus" @click="openCreateDialog" />
    </div>

    <DataTable
      :value="store.playlists"
      :loading="store.loading"
      stripedRows
      responsiveLayout="scroll"
    >
      <template #empty>プレイリストがありません。</template>

      <Column header="名前">
        <template #body="{ data }">
          <span>{{ data.name }}</span>
          <Tag v-if="data.isActive" value="アクティブ" severity="success" class="ml-2" />
        </template>
      </Column>

      <Column header="アイテム数" style="width: 8rem">
        <template #body="{ data }">{{ data.itemCount }}</template>
      </Column>

      <Column header="操作" style="width: 14rem">
        <template #body="{ data }">
          <div class="row-actions">
            <Button
              label="編集"
              icon="pi pi-pencil"
              size="small"
              text
              @click="router.push(`/playlists/${data.id}`)"
            />
            <Button
              v-if="!data.isActive"
              label="アクティブにする"
              icon="pi pi-check-circle"
              size="small"
              text
              severity="success"
              @click="activate(data.id, data.name)"
            />
            <Button
              v-if="!data.isActive"
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              @click="confirmDelete(data.id, data.name)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showCreateDialog" header="新規プレイリスト作成" modal style="width: 24rem">
      <div class="dialog-body">
        <label>名前</label>
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
.playlists-view {
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.row-actions {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.ml-2 {
  margin-left: 0.5rem;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.dialog-body label {
  font-weight: 600;
  font-size: 0.875rem;
}

.w-full {
  width: 100%;
}
</style>
