import { readJsonFromPublic } from '@/lib/songs.server'
import type { SongIndex, SongMeta } from '@/lib/types'
import PlayerClient from './PlayerClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SongPage({ params }: Props) {
  const { id } = await params

  let meta: SongMeta | null = null
  let error: string | null = null

  const [metaResult, songs] = await Promise.allSettled([
    readJsonFromPublic<SongMeta>(`songs/${id}/metadata.json`),
    readJsonFromPublic<SongIndex[]>('songs.json'),
  ])

  if (metaResult.status === 'fulfilled') {
    meta = metaResult.value
  } else {
    error = `No se encontró la canción "${id}".`
  }

  const songList = songs.status === 'fulfilled' ? songs.value : []

  if (error || !meta) {
    return (
      <main className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
        <p className="text-red-400 bg-red-950 rounded-xl p-4 text-sm">{error}</p>
      </main>
    )
  }

  return <PlayerClient meta={meta} songs={songList} />
}
