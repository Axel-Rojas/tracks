'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Plus, ChevronDown, ChevronRight, Users, List } from 'lucide-react'
import type { SongIndex } from '@/lib/types'
import { groupByArtist, sortByTitle } from '@/lib/songs'
import ResumeBanner from '@/components/SongList/ResumeBanner'

type ViewMode = 'artist' | 'all'

const VIEWS: readonly { id: ViewMode; label: string; Icon: typeof Users }[] = [
  { id: 'artist', label: 'Por artista', Icon: Users },
  { id: 'all', label: 'Todas', Icon: List },
]

function countLabel(n: number): string {
  return n === 1 ? '1 canción' : `${n} canciones`
}

function trackLabel(n: number): string {
  return n === 1 ? '1 pista' : `${n} pistas`
}

export default function SongListClient({ songs }: { songs: SongIndex[] }) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewMode>('artist')
  const [openArtists, setOpenArtists] = useState<Set<string>>(new Set())

  const q = query.toLowerCase().trim()

  const allGroups = useMemo(() => groupByArtist(songs), [songs])

  // Si coincide el artista se muestra el grupo entero; si no, solo los títulos que matchean.
  const groups = useMemo(() => {
    if (!q) return allGroups
    return allGroups
      .map(([artist, list]): [string, SongIndex[]] =>
        artist.toLowerCase().includes(q)
          ? [artist, list]
          : [artist, list.filter((s) => s.title.toLowerCase().includes(q))]
      )
      .filter(([, list]) => list.length > 0)
  }, [allGroups, q])

  // Vista plana: alfabética por título, con el mismo criterio de búsqueda que
  // la agrupada (matchea por título o por artista).
  const flatSongs = useMemo(() => {
    const sorted = sortByTitle(songs)
    if (!q) return sorted
    return sorted.filter(
      (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    )
  }, [songs, q])

  const matchCount =
    view === 'all' ? flatSongs.length : groups.reduce((n, [, list]) => n + list.length, 0)

  function toggleArtist(artist: string) {
    setOpenArtists((prev) => {
      const next = new Set(prev)
      next.has(artist) ? next.delete(artist) : next.add(artist)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <ResumeBanner songs={songs} />

      {/* Search + toolbar */}
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

        <Link
          href="/studio"
          className="flex items-center justify-center h-10 w-10 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 transition-colors flex-shrink-0 touch-manipulation"
          title="Agregar canción"
        >
          <Plus size={20} className="text-white" />
        </Link>
      </div>

      {/* Total (o cantidad de coincidencias mientras se busca) + selector de vista */}
      {songs.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-500">
            {query && matchCount === 0
              ? 'Sin resultados'
              : countLabel(query ? matchCount : songs.length)}
          </p>

          <div
            role="group"
            aria-label="Agrupar canciones"
            className="flex flex-shrink-0 gap-0.5 rounded-lg border border-zinc-700 bg-zinc-800 p-0.5"
          >
            {VIEWS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors touch-manipulation ${
                  view === id
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 active:bg-zinc-700/50'
                }`}
              >
                <Icon size={14} className="flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {songs.length === 0 && !query ? (
        <p className="text-zinc-500 text-sm">No hay canciones cargadas.</p>
      ) : view === 'all' ? (
        // Una sola lista alfabética por título; el artista y las pistas van debajo.
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 items-start">
          {flatSongs.map((song) => (
            <Link
              key={song.id}
              href={`/songs/${song.id}`}
              className="block px-2 py-2 rounded-lg hover:bg-zinc-800 active:bg-zinc-700 touch-manipulation transition-colors"
            >
              <span className="block text-sm font-medium text-white truncate">
                {song.title}
              </span>
              <span className="block text-xs text-zinc-500 truncate">
                {song.artist}
                {song.trackCount !== undefined && (
                  <span className="tabular-nums"> · {trackLabel(song.trackCount)}</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        // Grid por filas: el orden alfabético se lee de izquierda a derecha.
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 items-start">
          {groups.map(([artist, artistSongs]) => {
            // Al buscar, todos los grupos con coincidencias quedan desplegados.
            const isOpen = q.length > 0 || openArtists.has(artist)
            return (
              // El grupo abierto ocupa la fila entera y reparte sus canciones en
              // las mismas columnas: así no deja media fila vacía al costado.
              <div key={artist} className={isOpen ? 'md:col-span-2 lg:col-span-3' : undefined}>
                <button
                  onClick={() => toggleArtist(artist)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left hover:bg-zinc-800 active:bg-zinc-700 touch-manipulation transition-colors"
                >
                  {isOpen
                    ? <ChevronDown size={16} className="flex-shrink-0 text-zinc-500" />
                    : <ChevronRight size={16} className="flex-shrink-0 text-zinc-500" />
                  }
                  <span className="text-base font-semibold uppercase tracking-wide text-white truncate">
                    {artist}
                  </span>
                  <span className="ml-auto text-xs text-zinc-500 flex-shrink-0">
                    {artistSongs.length}
                  </span>
                </button>

                {/* Guía vertical: alinea los títulos un nivel a la derecha del artista. */}
                {isOpen && (
                  <div className="ml-6 mb-1 border-l border-zinc-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {artistSongs.map((song) => (
                      <Link
                        key={song.id}
                        href={`/songs/${song.id}`}
                        className="flex items-center pl-10 pr-4 py-2.5 rounded-r-lg hover:bg-zinc-800 active:bg-zinc-700 touch-manipulation transition-colors"
                      >
                        <span className="text-sm font-medium text-zinc-300 truncate">
                          {song.title}
                        </span>
                        {song.trackCount !== undefined && (
                          <span className="ml-2 text-[11px] text-zinc-500 flex-shrink-0 tabular-nums">
                            {trackLabel(song.trackCount)}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
