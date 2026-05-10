import { onScopeDispose, ref, type Ref } from 'vue'

export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return matches
  }
  const mql = window.matchMedia(query)
  matches.value = mql.matches
  const handler = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }
  mql.addEventListener('change', handler)
  onScopeDispose(() => mql.removeEventListener('change', handler))
  return matches
}
