import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import PlayerClient from './PlayerClient'

interface Props {
  params: Promise<{ slug: string }>
}

export const revalidate = 3600

export default async function SongPage({ params }: Props) {
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
