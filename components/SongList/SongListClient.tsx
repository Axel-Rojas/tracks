'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { SongIndex } from '@/lib/types'
import SongCard from './SongCard'

type SortKey = 'title' | 'artist'

export default function SongListClient({ songs }: { songs: SongIndex[] }) {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('title')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const result = q
      ? songs.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.artist.toLowerCase().includes(q)
        )
      : [...songs]

    result.sort((a, b) => {
      if (sortBy === 'artist') {
        const artistCmp = a.artist.localeCompare(b.artist, 'es')
        return artistCmp !== 0 ? artistCmp : a.title.localeCompare(b.title, 'es')
      }
      return a.title.localeCompare(b.title, 'es')
    })

    return result
  }, [songs, query, sortBy])

  return (
    <div className="flex flex-col gap-4">
      {/* Search + sort toolbar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
          <input
            type="search"
            placeholder="Buscar canción o artista…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-zinc-800 text-white text-sm placeholder:text-zinc-500 outline-none border border-zinc-700 focus:border-zinc-500 transition-colors"
          />
        </div>

        <div className="flex rounded-xl overflow-hidden border border-zinc-700 flex-shrink-0">
          {(['title', 'artist'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`h-10 px-3 text-xs font-medium touch-manipulation transition-colors ${
                sortBy === key
                  ? 'bg-zinc-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {key === 'title' ? 'Nombre' : 'Artista'}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {query && (
        <p className="text-xs text-zinc-500">
          {filtered.length === 0
            ? 'Sin resultados'
            : `${filtered.length} canción${filtered.length !== 1 ? 'es' : ''}`}
        </p>
      )}

      {/* Grid */}
      {filtered.length === 0 && !query ? (
        <p className="text-zinc-500 text-sm">No hay canciones cargadas.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      )}
    </div>
  )
}
