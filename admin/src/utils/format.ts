export function formatBytes(bytes: string | number | null): string {
  if (bytes === null) return '—'
  const n = typeof bytes === 'number' ? bytes : Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
