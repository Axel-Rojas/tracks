import Link from 'next/link'
import type { SongIndex } from '@/lib/types'

export default function SongCard({ song }: { song: SongIndex }) {
  return (
    <Link
      href={`/songs/${song.id}`}
      className="block rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 transition-colors p-4 touch-manipulation"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-green-400 mb-1 truncate">
        {song.artist}
      </p>
      <h2 className="text-base font-semibold text-white leading-snug line-clamp-2">
        {song.title}
      </h2>
    </Link>
  )
}
