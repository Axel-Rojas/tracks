'use client'

import Link from 'next/link'
import type { SongIndex } from '@/lib/types'

interface Props {
  songs: SongIndex[]
  currentId: string
  isOpen: boolean
  onClose: () => void
}

export default function SongSidebar({ songs, currentId, isOpen, onClose }: Props) {
  const showStudio = process.env.NODE_ENV === 'development'

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
            ✕
          </button>
        </div>

        {/* All songs link */}
        <Link
          href="/"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 hover:bg-zinc-800 active:bg-zinc-700 touch-manipulation transition-colors"
        >
          <span className="text-xs text-zinc-400">←</span>
          <span className="text-sm font-medium text-zinc-300">Todas las canciones</span>
        </Link>

        {/* Song list */}
        <nav className="flex-1 overflow-y-auto py-2">
          {songs.map((song) => {
            const active = song.id === currentId
            return (
              <Link
                key={song.id}
                href={`/song/${song.id}`}
                onClick={onClose}
                className={`flex flex-col px-3 py-2.5 transition-colors touch-manipulation border-l-2 ${
                  active
                    ? 'bg-green-500/10 border-green-400'
                    : 'hover:bg-zinc-800 border-transparent'
                }`}
              >
                <span className={`text-sm font-medium truncate ${active ? 'text-green-400' : 'text-white'}`}>
                  {song.title}
                </span>
                <span className="text-xs text-zinc-500 truncate">{song.artist}</span>
              </Link>
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
