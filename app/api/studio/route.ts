import { NextRequest, NextResponse } from 'next/server'
import { writeFile, rm, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import type { SongIndex, SongMeta } from '@/lib/types'

const SONGS_DIR = path.join(process.cwd(), 'public', 'songs')
const SONGS_JSON = path.join(process.cwd(), 'public', 'songs.json')

function devOnly() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development' }, { status: 403 })
  }
  return null
}

type SSEEvent =
  | { type: 'log'; text: string }
  | { type: 'progress'; pct: number; text: string }
  | { type: 'done'; id: string }
  | { type: 'error'; message: string }

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
  const title = (formData.get('title') as string | null)?.trim()
  const artist = (formData.get('artist') as string | null)?.trim()
  const bpm = (formData.get('bpm') as string | null)?.trim()
  const songFile = formData.get('song') as File | null
  const chordsFile = formData.get('chords') as File | null

  if (!id || !title || !artist || !songFile) {
    return NextResponse.json({ error: 'Faltan campos requeridos (id, title, artist, song)' }, { status: 400 })
  }

  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json(
      { error: 'ID debe contener solo minúsculas, números y guiones' },
      { status: 400 }
    )
  }

  // Read files into memory before starting the stream
  let songBuffer: Buffer
  let chordsBuffer: Buffer | null = null
  let chordsFileName: string | null = null

  try {
    songBuffer = Buffer.from(await songFile.arrayBuffer())
    if (chordsFile instanceof File && chordsFile.size > 0) {
      chordsBuffer = Buffer.from(await chordsFile.arrayBuffer())
      chordsFileName = chordsFile.name
    }
  } catch {
    return NextResponse.json({ error: 'Error leyendo los archivos' }, { status: 500 })
  }

  const scriptArgs = [
    path.join(process.cwd(), 'scripts', 'add_song.py'),
    '--title', title,
    '--artist', artist,
    '--id', id,
    '--overwrite',
    ...(bpm ? ['--bpm', bpm] : []),
  ]

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
        } catch { /* client disconnected */ }
      }

      // Save song to temp file
      const tmpPath = path.join(os.tmpdir(), `demucs-${crypto.randomUUID()}.mp3`)
      try {
        await writeFile(tmpPath, songBuffer)
      } catch {
        send({ type: 'error', message: 'Error guardando archivo temporal' })
        controller.close()
        return
      }

      send({ type: 'log', text: 'Archivo guardado. Iniciando procesamiento...' })

      const proc = spawn('python', [...scriptArgs, tmpPath], { cwd: process.cwd() })

      const handleChunk = (data: Buffer) => {
        // tqdm uses \r for in-place updates — split on both \r and \n
        const parts = data.toString('utf-8').split(/[\r\n]/).filter((s) => s.trim())
        for (const part of parts) {
          const pctMatch = part.match(/^\s*(\d+)%\|/)
          if (pctMatch) {
            send({ type: 'progress', pct: parseInt(pctMatch[1]), text: part.trim() })
          } else {
            send({ type: 'log', text: part.trim() })
          }
        }
      }

      proc.stdout.on('data', (d: Buffer) => { process.stdout.write(d); handleChunk(d) })
      proc.stderr.on('data', (d: Buffer) => { process.stderr.write(d); handleChunk(d) })

      proc.on('close', async (code) => {
        await rm(tmpPath, { force: true })

        if (code !== 0) {
          send({ type: 'error', message: 'Demucs falló. Revisá la terminal para más detalles.' })
          controller.close()
          return
        }

        // Handle optional chords PDF
        if (chordsBuffer && chordsFileName) {
          try {
            const songDir = path.join(SONGS_DIR, id)
            await mkdir(songDir, { recursive: true })
            await writeFile(path.join(songDir, chordsFileName), chordsBuffer)
            const metaPath = path.join(songDir, 'metadata.json')
            const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as SongMeta
            meta.chordsFile = chordsFileName
            await writeFile(metaPath, JSON.stringify(meta, null, 2))
          } catch { /* non-fatal */ }
        }

        send({ type: 'done', id })
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

export async function GET() {
  const guard = devOnly()
  if (guard) return guard

  if (!existsSync(SONGS_JSON)) return NextResponse.json([])

  try {
    const raw = await readFile(SONGS_JSON, 'utf-8')
    return NextResponse.json(JSON.parse(raw) as SongIndex[])
  } catch {
    return NextResponse.json([])
  }
}
