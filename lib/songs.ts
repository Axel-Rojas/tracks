import type { SongIndex } from '@/lib/types'

const R2_BASE = process.env.NEXT_PUBLIC_R2_URL

export function rawUrl(path: string): string {
  if (!R2_BASE) throw new Error('NEXT_PUBLIC_R2_URL no está definido')
  return `${R2_BASE}/${path}`
}

/**
 * Agrupa canciones por artista: grupos ordenados por artista y, dentro de
 * cada uno, canciones ordenadas por título.
 */
export function groupByArtist(songs: SongIndex[]): [string, SongIndex[]][] {
  const map = new Map<string, SongIndex[]>()
  for (const song of songs) {
    const list = map.get(song.artist) ?? []
    list.push(song)
    map.set(song.artist, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title, 'es'))
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
}

/**
 * Todas las canciones en una sola lista, alfabética por título (sin importar
 * el artista). Copia el array: el que llega por props no se toca.
 */
export function sortByTitle(songs: SongIndex[]): SongIndex[] {
  return [...songs].sort((a, b) => a.title.localeCompare(b.title, 'es'))
}

/**
 * Fetch JSON from a relative URL (client-side).
 */
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json() as Promise<T>
}
