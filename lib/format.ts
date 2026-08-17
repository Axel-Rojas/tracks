// Intl arma el "hace X" en castellano y resuelve los plurales solo.
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'always' })

const AGO_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

/** "hace 5 minutos", "hace 2 días". Abajo del minuto el detalle no aporta nada. */
export function formatTimeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, (now - timestamp) / 1000)
  for (const [unit, size] of AGO_UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit)
  }
  return 'hace un momento'
}

export function formatTime(s: number, showMs = false): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const base = `${m}:${sec.toString().padStart(2, '0')}`
  if (!showMs) return base
  const ms = Math.round((s % 1) * 10)
  return `${base}.${ms}`
}
