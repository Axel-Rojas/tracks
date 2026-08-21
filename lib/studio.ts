/** Cantidad de pistas en las que Demucs puede partir la canción. */
export const STEM_MODES = [2, 4] as const
export type StemMode = (typeof STEM_MODES)[number]

export const STEM_OPTIONS: { value: StemMode; label: string; names: string[] }[] = [
  { value: 2, label: '2 pistas', names: ['Voz', 'Instrumental'] },
  { value: 4, label: '4 pistas', names: ['Batería', 'Bajo', 'Otros', 'Voz'] },
]

export const DEFAULT_STEM_MODE: StemMode = 2

/** Qué va a pasar al procesar `stems` sobre un slug que ya existe en la lista. */
export type StemPlan = 'create' | 'replace' | 'blocked'

/**
 * La separación solo se reemplaza hacia arriba: 2 → 4 sí, 4 → 2 o 2 → 2 no.
 * Con menos (o la misma cantidad de) pistas no hay nada que ganar y se perdería
 * la separación más detallada, así que la corrida se rechaza antes de correr
 * Demucs. La regla vive también en `songs:seed`, que es la que decide de verdad
 * cuando dos jobs entran a la vez.
 */
export function stemPlan(existingTrackCount: number | undefined, stems: StemMode): StemPlan {
  if (existingTrackCount === undefined) return 'create'
  return stems > existingTrackCount ? 'replace' : 'blocked'
}

export function blockedStemMessage(existingTrackCount: number, stems: StemMode): string {
  return `Ese ID ya existe con ${existingTrackCount} pistas. Solo se reemplaza al separar en más pistas de las que ya tiene (elegiste ${stems}).`
}

/** Devuelve null si el valor no es un modo válido, para que la API responda 400. */
export function parseStemMode(raw: string | null | undefined): StemMode | null {
  if (!raw) return DEFAULT_STEM_MODE
  const n = Number(raw)
  return STEM_MODES.includes(n as StemMode) ? (n as StemMode) : null
}

export function parseETA(text: string): string | null {
  const m = text.match(/\[(\d+:\d+)<(\d+:\d+)/)
  if (!m) return null
  return `${m[1]} transcurrido · faltan ${m[2]}`
}

export function inferPhase(text: string): string | null {
  if (text.includes('Descargando audio desde YouTube')) return 'Descargando desde YouTube...'
  if (text.includes('Convirtiendo')) return 'Convirtiendo a WAV...'
  // "Separando pistas" (2 stems) y "Separando en 4 pistas" salen del mismo paso.
  if (text.includes('Separando') || text.includes('Separating track')) return 'Separando pistas...'
  if (text.includes('Downloading') || text.includes('Descargando modelo')) return 'Descargando modelo Demucs...'
  if (text.includes('Iniciando')) return 'Iniciando...'
  return null
}
