import { inject, onBeforeUnmount, provide, reactive, type InjectionKey } from 'vue'

export interface TopbarState {
  title: string
  subtitle: string | null
  crumbs: string[]
}

export interface TopbarApi {
  state: TopbarState
  set: (patch: Partial<TopbarState>) => void
  reset: () => void
}

const KEY: InjectionKey<TopbarApi> = Symbol('admin-topbar')

const DEFAULT: TopbarState = {
  title: '',
  subtitle: null,
  crumbs: [],
}

export function provideTopbar(): TopbarApi {
  const state = reactive<TopbarState>({ ...DEFAULT })
  const api: TopbarApi = {
    state,
    set: (patch) => Object.assign(state, patch),
    reset: () => Object.assign(state, DEFAULT),
  }
  provide(KEY, api)
  return api
}

export function useTopbar() {
  const api = inject(KEY)
  if (!api) {
    throw new Error('useTopbar() must be used inside <AppShell>')
  }
  return api
}

export function setPageMeta(meta: Partial<TopbarState>) {
  const api = useTopbar()
  api.set(meta)
  onBeforeUnmount(() => api.reset())
}
