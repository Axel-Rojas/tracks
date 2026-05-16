import { fetchJson } from '@/lib/songs'
import type { SongIndex } from '@/lib/types'
import SongListClient from '@/components/SongList/SongListClient'

export const revalidate = 3600

export default async function HomePage() {
  let songs: SongIndex[] = []
  let error: string | null = null

  try {
    songs = await fetchJson<SongIndex[]>('songs.json')
  } catch {
    error = 'No se pudo cargar la lista de canciones.'
  }

  return (
    <main className="min-h-screen bg-zinc-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-1">Práctica</h1>
        <p className="text-zinc-500 text-sm mb-6">Elige una canción para practicar</p>

        {error ? (
          <p className="text-red-400 bg-red-950 rounded-xl p-4 text-sm">{error}</p>
        ) : (
          <SongListClient songs={songs} />
        )}
      </div>
    </main>
  )
}
