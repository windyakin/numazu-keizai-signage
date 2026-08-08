<script setup lang="ts">
import { useConnectivityStatus } from "../composables/useConnectivityStatus";

const { isWarning, isCritical } = useConnectivityStatus();
</script>

<template>
  <div v-if="isWarning" class="connectivity-dot" />
  <div v-if="isCritical" class="connectivity-text">オフラインです</div>
</template>

<style scoped>
.connectivity-dot {
  position: fixed;
  top: 12px;
  right: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-error);
  z-index: 9999;
  pointer-events: none;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.connectivity-text {
  position: fixed;
  bottom: 16px;
  right: 16px;
  padding: 6px 14px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.85rem;
  border-radius: 4px;
  z-index: 9999;
  pointer-events: none;
}
</style>
