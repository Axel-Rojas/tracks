import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type { SongIndex, SongMeta } from '@/lib/types'

const SONGS_DIR = path.join(process.cwd(), 'public', 'songs')
const SONGS_JSON = path.join(process.cwd(), 'public', 'songs.json')

function devOnly() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development' }, { status: 403 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const guard = devOnly()
  if (guard) return guard

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const id = (formData.get('id') as string | null)?.trim()
  const metaRaw = formData.get('metadata') as string | null

  if (!id || !metaRaw) {
    return NextResponse.json({ error: 'Missing id or metadata' }, { status: 400 })
  }

  // Validate slug
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json(
      { error: 'ID must be lowercase letters, numbers, and hyphens only' },
      { status: 400 }
    )
  }

  let meta: SongMeta
  try {
    meta = JSON.parse(metaRaw) as SongMeta
  } catch {
    return NextResponse.json({ error: 'Invalid metadata JSON' }, { status: 400 })
  }

  const songDir = path.join(SONGS_DIR, id)
  await mkdir(songDir, { recursive: true })

  // Write audio track files
  const trackFiles = formData.getAll('tracks') as File[]
  for (const file of trackFiles) {
    if (!(file instanceof File) || file.size === 0) continue
    const buf = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(songDir, file.name), buf)
  }

  // Write chords PDF
  const chordsFile = formData.get('chords') as File | null
  if (chordsFile instanceof File && chordsFile.size > 0) {
    const buf = Buffer.from(await chordsFile.arrayBuffer())
    await writeFile(path.join(songDir, chordsFile.name), buf)
    meta.chordsFile = chordsFile.name
  }

  // Write metadata.json
  await writeFile(
    path.join(songDir, 'metadata.json'),
    JSON.stringify(meta, null, 2),
    'utf-8'
  )

  // Update songs.json
  let songs: SongIndex[] = []
  if (existsSync(SONGS_JSON)) {
    try {
      songs = JSON.parse(await readFile(SONGS_JSON, 'utf-8')) as SongIndex[]
    } catch { /* start fresh if corrupt */ }
  }

  const entry: SongIndex = { id: meta.id, title: meta.title, artist: meta.artist }
  const existing = songs.findIndex((s) => s.id === id)
  if (existing >= 0) {
    songs[existing] = entry
  } else {
    songs.push(entry)
  }

  await writeFile(SONGS_JSON, JSON.stringify(songs, null, 2), 'utf-8')

  return NextResponse.json({ ok: true, id })
}

// List existing local songs
export async function GET() {
  const guard = devOnly()
  if (guard) return guard

  if (!existsSync(SONGS_JSON)) {
    return NextResponse.json([])
  }

  try {
    const raw = await readFile(SONGS_JSON, 'utf-8')
    return NextResponse.json(JSON.parse(raw))
  } catch {
    return NextResponse.json([])
  }
}
