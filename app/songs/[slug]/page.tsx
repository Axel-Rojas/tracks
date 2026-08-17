import { Suspense } from 'react'
import { connection } from 'next/server'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import PlayerClient from './PlayerClient'
import SongLoading from './loading'

interface Props {
  params: Promise<{ slug: string }>
}

// Igual que el listado: meta de la canción y sidebar siempre frescos, sin cache.
// El await de params vive acá adentro, detrás del <Suspense>, para que el shell
// de la ruta no quede atado a un slug y se pueda prefetchear una sola vez.
async function Song({ params }: Props) {
  await connection()
  const { slug } = await params

  const [meta, songs] = await Promise.all([
    fetchQuery(api.songs.getBySlug, { slug }),
    fetchQuery(api.songs.listPublic),
  ])

  if (!meta) {
    return (
      <main className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
        <p className="text-red-400 bg-red-950 rounded-xl p-4 text-sm">
          No se encontró la canción &ldquo;{slug}&rdquo;.
        </p>
      </main>
    )
  }

  return <PlayerClient meta={meta} songs={songs} />
}

export default function SongPage({ params }: Props) {
  return (
    <Suspense fallback={<SongLoading />}>
      <Song params={params} />
    </Suspense>
  )
}
