'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import type { SongIndex } from '@/lib/types'
import { formatTimeAgo } from '@/lib/format'
import { getLastSession, getServerLastSession, subscribeLastSession } from '@/lib/lastSession'

/**
 * Invitación a retomar la última canción practicada. Sale de localStorage, así
 * que no existe en el HTML del server: aparece al hidratar.
 */
export default function ResumeBanner({ songs }: { songs: SongIndex[] }) {
  const last = useSyncExternalStore(subscribeLastSession, getLastSession, getServerLastSession)

  // Si la canción se borró o cambió de slug, el link llevaría a un 404.
  const song = last && songs.find((s) => s.id === last.id)
  if (!last || !song) return null

  return (
    <Link
      href={`/songs/${song.id}`}
      className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-800/40 px-4 py-3 hover:bg-zinc-800 active:bg-zinc-700 transition-colors touch-manipulation"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-green-600/15 text-green-400">
        <Play size={16} fill="currentColor" />
      </span>

      <span className="min-w-0">
        <span className="block text-sm text-zinc-300">
          ¿Querés seguir practicando{' '}
          <span className="font-semibold text-white">{song.title}</span> de{' '}
          <span className="font-semibold text-white">{song.artist}</span>?
        </span>
        <span className="block text-xs text-zinc-500">
          Última sesión {formatTimeAgo(last.at)}
        </span>
      </span>
    </Link>
  )
}
