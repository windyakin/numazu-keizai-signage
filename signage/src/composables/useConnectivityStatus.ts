import { ref, computed, onMounted, onUnmounted } from "vue";
import { fetchSyncStatus } from "../api/status";

const POLL_INTERVAL_MS = 60_000;
const WARNING_THRESHOLD_MS = 15 * 60 * 1000;
const CRITICAL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function useConnectivityStatus() {
  const now = ref(new Date());
  const lastEdgeContact = ref<Date | null>(null);
  const upstreamLastSuccess = ref<Date | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;

  function effectiveLastSuccess(): Date | null {
    const edge = lastEdgeContact.value;
    const upstream = upstreamLastSuccess.value;
    if (edge === null) return null;
    if (upstream === null) return edge;
    return edge < upstream ? edge : upstream;
  }

  const isWarning = computed(() => {
    const last = effectiveLastSuccess();
    if (last === null) return false;
    return now.value.getTime() - last.getTime() >= WARNING_THRESHOLD_MS;
  });

  const isCritical = computed(() => {
    const last = effectiveLastSuccess();
    if (last === null) return false;
    return now.value.getTime() - last.getTime() >= CRITICAL_THRESHOLD_MS;
  });

  async function poll(): Promise<void> {
    now.value = new Date();
    try {
      const data = await fetchSyncStatus();
      lastEdgeContact.value = new Date();
      upstreamLastSuccess.value = data.lastSuccess
        ? new Date(data.lastSuccess)
        : null;
    } catch {
      // edge unreachable — lastEdgeContact stays at its last known value
    }
  }

  onMounted(() => {
    void poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { isWarning, isCritical };
}
