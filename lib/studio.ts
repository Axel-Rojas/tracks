export function parseETA(text: string): string | null {
  const m = text.match(/\[(\d+:\d+)<(\d+:\d+)/)
  if (!m) return null
  return `${m[1]} transcurrido · faltan ${m[2]}`
}

export function inferPhase(text: string): string | null {
  if (text.includes('Descargando audio desde YouTube')) return 'Descargando desde YouTube...'
  if (text.includes('Convirtiendo')) return 'Convirtiendo a WAV...'
  if (text.includes('Separando pistas') || text.includes('Separating track')) return 'Separando pistas...'
  if (text.includes('Downloading') || text.includes('Descargando modelo')) return 'Descargando modelo Demucs...'
  if (text.includes('Iniciando')) return 'Iniciando...'
  return null
}
