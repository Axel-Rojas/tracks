import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { writeFile, rm, readFile } from 'fs/promises'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { uploadToR2 } from '@/lib/r2'
import type { SSEEvent } from '@/lib/types'

const SONGS_DIR = path.join(process.cwd(), 'public', 'songs')
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(req: NextRequest) {
  const secret = process.env.STUDIO_SECRET
  if (!secret || req.headers.get('x-studio-key') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const id = (formData.get('id') as string | null)?.trim()
  const title = (formData.get('title') as string | null)?.trim()
  const artist = (formData.get('artist') as string | null)?.trim()
  const bpmStr = (formData.get('bpm') as string | null)?.trim()
  const bpm = bpmStr ? parseInt(bpmStr) : undefined
  const songFile = formData.get('song') as File | null
  const chordsFile = formData.get('chords') as File | null
  const youtubeUrl = (formData.get('youtubeUrl') as string | null)?.trim() || null

  if (!id || !title || !artist || (!songFile && !youtubeUrl)) {
    return NextResponse.json({ error: 'Faltan campos requeridos (id, title, artist, y song o youtubeUrl)' }, { status: 400 })
  }

  if (youtubeUrl && !/^https:\/\/(www\.youtube\.com|youtu\.be)\//.test(youtubeUrl)) {
    return NextResponse.json({ error: 'URL de YouTube inválida' }, { status: 400 })
  }

  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json(
      { error: 'ID debe contener solo minúsculas, números y guiones' },
      { status: 400 }
    )
  }

  let songBuffer: Buffer | null = null
  let chordsBuffer: Buffer | null = null
  let chordsFileName: string | null = null

  try {
    if (songFile) songBuffer = Buffer.from(await songFile.arrayBuffer())
    if (chordsFile instanceof File && chordsFile.size > 0) {
      chordsBuffer = Buffer.from(await chordsFile.arrayBuffer())
      // path.basename strips any directory traversal from the filename
      chordsFileName = path.basename(chordsFile.name)
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
    ...(bpm !== undefined ? ['--bpm', String(bpm)] : []),
    ...(youtubeUrl ? ['--youtube-url', youtubeUrl] : []),
  ]

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
        } catch { /* client disconnected */ }
      }

      let tmpPath: string | null = null

      if (songBuffer) {
        tmpPath = path.join(os.tmpdir(), `demucs-${crypto.randomUUID()}.mp3`)
        try {
          await writeFile(tmpPath, songBuffer)
        } catch {
          send({ type: 'error', message: 'Error guardando archivo temporal' })
          controller.close()
          return
        }
        send({ type: 'log', text: 'Archivo guardado. Iniciando procesamiento...' })
      } else {
        send({ type: 'log', text: 'Iniciando descarga desde YouTube...' })
      }

      const procArgs = tmpPath ? [...scriptArgs, tmpPath] : scriptArgs
      const proc = spawn('python', procArgs, { cwd: process.cwd() })

      const handleChunk = (data: Buffer) => {
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
        if (tmpPath) await rm(tmpPath, { force: true })

        const songDir = path.join(SONGS_DIR, id)

        try {
          if (code !== 0) {
            send({ type: 'error', message: 'Demucs falló. Revisá la terminal para más detalles.' })
            return
          }

          send({ type: 'log', text: 'Subiendo pistas a R2...' })

          const [vozBuf, instrBuf] = await Promise.all([
            readFile(path.join(songDir, 'Voz.mp3')),
            readFile(path.join(songDir, 'Instrumental.mp3')),
          ])

          const r2Uploads: Promise<void>[] = [
            uploadToR2(`songs/${id}/Voz.mp3`, vozBuf, 'audio/mpeg'),
            uploadToR2(`songs/${id}/Instrumental.mp3`, instrBuf, 'audio/mpeg'),
          ]

          let chordsKey: string | undefined
          if (chordsBuffer && chordsFileName) {
            chordsKey = `songs/${id}/${chordsFileName}`
            r2Uploads.push(uploadToR2(chordsKey, chordsBuffer, 'application/pdf'))
          }

          await Promise.all(r2Uploads)

          send({ type: 'log', text: 'Guardando en Convex...' })

          const convexId = await convex.mutation(api.songs.seed, {
            title,
            artist,
            slug: id,
            bpm,
            isPublic: true,
            chordsFile: chordsKey,
            tracks: [
              { id: 'instrumental', label: 'Instrumental', file: `songs/${id}/Instrumental.mp3`, defaultVolume: 0.5 },
              { id: 'voz', label: 'Voz', file: `songs/${id}/Voz.mp3`, defaultVolume: 0.5 },
            ],
          })

          if (!convexId) {
            send({ type: 'log', text: 'Nota: slug ya existía en Convex, archivos actualizados solo en R2.' })
          }

          revalidatePath('/')
          send({ type: 'done', id })
        } catch (err) {
          console.error('Studio upload error:', err)
          send({ type: 'error', message: 'Error al guardar. Revisá la terminal para más detalles.' })
        } finally {
          controller.close()
          await rm(songDir, { recursive: true, force: true })
        }
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
