import { Suspense } from 'react'
import Image from 'next/image'
import { connection } from 'next/server'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import type { SongIndex } from '@/lib/types'
import SongListClient from '@/components/SongList/SongListClient'
import SongListSkeleton from '@/components/SongList/SongListSkeleton'

// El listado tiene que reflejar la DB en cada request: sin cache ni ISR. Al
// quedar detrás del <Suspense>, la navegación igual es instantánea (se pinta el
// shell y la lista entra por streaming).
async function SongList() {
  // Marca el subárbol como request-time: fetchQuery no se puede prerenderizar
  // (usa Math.random() internamente) y además queremos datos frescos siempre.
  await connection()

  let songs: SongIndex[] = []
  let error: string | null = null

  try {
    songs = await fetchQuery(api.songs.listPublic)
  } catch {
    error = 'No se pudo cargar la lista de canciones.'
  }

  if (error) {
    return <p className="text-red-400 bg-red-950 rounded-xl p-4 text-sm">{error}</p>
  }

  return <SongListClient songs={songs} />
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-1">
          {/* Mismo ícono que el favicon / la PWA. */}
          <Image
            src="/icon.svg"
            alt=""
            width={40}
            height={40}
            unoptimized
            priority
            className="flex-shrink-0"
          />
          <h1 className="text-3xl font-bold text-white">Tracks</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-6">Elegí una canción para practicar</p>

        <Suspense fallback={<SongListSkeleton />}>
          <SongList />
        </Suspense>
      </div>
    </main>
  )
}
