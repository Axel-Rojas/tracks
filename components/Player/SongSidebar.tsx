'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import type { SongIndex } from '@/lib/types'

interface Props {
  songs: SongIndex[]
  currentId: string
  isOpen: boolean
  onClose: () => void
}

function groupByArtist(songs: SongIndex[]): [string, SongIndex[]][] {
  const map = new Map<string, SongIndex[]>()
  for (const song of songs) {
    const list = map.get(song.artist) ?? []
    list.push(song)
    map.set(song.artist, list)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
}

export default function SongSidebar({ songs, currentId, isOpen, onClose }: Props) {
  const showStudio = process.env.NODE_ENV === 'development'
  const groups = groupByArtist(songs)

  const [openArtists, setOpenArtists] = useState<Set<string>>(() => {
    const active = songs.find((s) => s.id === currentId)
    return active ? new Set([active.artist]) : new Set()
  })

  function toggleArtist(artist: string) {
    setOpenArtists((prev) => {
      const next = new Set(prev)
      next.has(artist) ? next.delete(artist) : next.add(artist)
      return next
    })
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-52 flex flex-col bg-zinc-900 border-r border-zinc-800 transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800 flex-shrink-0">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Canciones
          </span>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300"
            aria-label="Cerrar sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* All songs link */}
        <Link
          href="/"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 hover:bg-zinc-800 active:bg-zinc-700 touch-manipulation transition-colors"
        >
          <ArrowLeft size={14} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">Todas las canciones</span>
        </Link>

        {/* Song list grouped by artist */}
        <nav className="flex-1 overflow-y-auto py-2">
          {groups.map(([artist, artistSongs]) => {
            const isOpen = openArtists.has(artist)
            const hasActive = artistSongs.some((s) => s.id === currentId)
            return (
              <div key={artist}>
                <button
                  onClick={() => toggleArtist(artist)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left touch-manipulation transition-colors hover:bg-zinc-800 active:bg-zinc-700 ${
                    hasActive ? 'text-green-400' : 'text-zinc-300'
                  }`}
                >
                  {isOpen
                    ? <ChevronDown size={13} className="flex-shrink-0 text-zinc-500" />
                    : <ChevronRight size={13} className="flex-shrink-0 text-zinc-500" />
                  }
                  <span className="text-xs font-semibold truncate uppercase tracking-wide">
                    {artist}
                  </span>
                </button>

                {isOpen && artistSongs.map((song) => {
                  const active = song.id === currentId
                  return (
                    <Link
                      key={song.id}
                      href={`/songs/${song.id}`}
                      onClick={onClose}
                      className={`flex items-center pl-7 pr-3 py-2 transition-colors touch-manipulation border-l-2 ${
                        active
                          ? 'bg-green-500/10 border-green-400'
                          : 'hover:bg-zinc-800 border-transparent'
                      }`}
                    >
                      <span className={`text-sm truncate ${active ? 'text-green-400' : 'text-zinc-200'}`}>
                        {song.title}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer — studio link (dev only) */}
        {showStudio && (
          <div className="border-t border-zinc-800 p-3 flex-shrink-0">
            <Link
              href="/studio"
              onClick={onClose}
              className="flex items-center justify-center h-9 w-full rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-xs text-zinc-400 hover:text-zinc-200 touch-manipulation transition-colors"
            >
              + Agregar canción
            </Link>
          </div>
        )}
      </aside>
    </>
  )
}
