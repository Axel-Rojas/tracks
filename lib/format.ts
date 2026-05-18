export function formatTime(s: number, showMs = false): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const base = `${m}:${sec.toString().padStart(2, '0')}`
  if (!showMs) return base
  const ms = Math.round((s % 1) * 10)
  return `${base}.${ms}`
}
