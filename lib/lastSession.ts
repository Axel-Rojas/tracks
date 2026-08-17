/**
 * Última canción practicada, guardada en localStorage. La escribe el player
 * cuando el audio arranca y la lee el listado para ofrecer retomarla.
 *
 * Solo se guarda el id: título y artista se resuelven contra la lista real, así
 * el banner nunca muestra datos viejos ni linkea a una canción que ya no está.
 */

const KEY = 'last-session'

export interface LastSession {
  id: string
  at: number // epoch ms
}

function parse(raw: string | null): LastSession | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LastSession>
    if (typeof parsed?.id !== 'string' || typeof parsed?.at !== 'number') return null
    return { id: parsed.id, at: parsed.at }
  } catch {
    return null
  }
}

export function saveLastSession(id: string): void {
  const entry: LastSession = { id, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(entry))
  } catch { /* ignore */ }
}

// useSyncExternalStore compara snapshots por identidad: mientras el string crudo
// no cambie hay que devolver exactamente la misma referencia, o el parse nuevo
// de cada render dispara un loop de re-renders.
let cache: { raw: string | null; value: LastSession | null } = { raw: null, value: null }

export function getLastSession(): LastSession | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { /* ignore */ }
  if (raw !== cache.raw) cache = { raw, value: parse(raw) }
  return cache.value
}

// En el server no hay localStorage: el banner no sale en el HTML y aparece al hidratar.
export function getServerLastSession(): null {
  return null
}

// Alcanza con el evento 'storage' (otra pestaña): dentro de la misma pestaña el
// único que escribe es el player, y volver al listado remonta el banner.
export function subscribeLastSession(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}
