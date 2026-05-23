import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { writeFile, rm } from 'fs/promises'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { uploadToR2 } from '@/lib/r2'
import type { SSEEvent } from '@/lib/types'

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  if (process.env.NODE_ENV !== 'development') {
    const secret = (formData.get('secret') as string | null)?.trim()
    if (!process.env.STUDIO_SECRET || secret !== process.env.STUDIO_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const slug = (formData.get('id') as string | null)?.trim()
  const title = (formData.get('title') as string | null)?.trim()
  const artist = (formData.get('artist') as string | null)?.trim()
  const bpmStr = (formData.get('bpm') as string | null)?.trim()
  const bpm = bpmStr ? parseInt(bpmStr) : undefined
  const songFile = formData.get('song') as File | null
  const chordsFile = formData.get('chords') as File | null
  const youtubeUrl = (formData.get('youtubeUrl') as string | null)?.trim() || null

  if (!slug || !title || !artist || (!songFile && !youtubeUrl)) {
    return NextResponse.json({ error: 'Faltan campos requeridos (id, title, artist, y song o youtubeUrl)' }, { status: 400 })
  }

  if (youtubeUrl && !/^https:\/\/(www\.youtube\.com|youtu\.be)\//.test(youtubeUrl)) {
    return NextResponse.json({ error: 'URL de YouTube inválida' }, { status: 400 })
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'ID debe contener solo minúsculas, números y guiones' }, { status: 400 })
  }

  // ── Dev path: spawn local Python script, stream SSE ──────────────────────
  if (process.env.NODE_ENV === 'development') {
    let songBuffer: Buffer | null = null

    try {
      if (songFile) songBuffer = Buffer.from(await songFile.arrayBuffer())
    } catch {
      return NextResponse.json({ error: 'Error leyendo los archivos' }, { status: 500 })
    }

    const scriptArgs = [
      path.join(process.cwd(), 'scripts', 'add_song.py'),
      '--title', title,
      '--artist', artist,
      '--id', slug,
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

          if (code !== 0) {
            send({ type: 'error', message: 'Demucs falló. Revisá la terminal para más detalles.' })
            controller.close()
            return
          }

          revalidatePath('/', 'page')
          revalidatePath('/songs/[slug]', 'page')
          send({ type: 'done', id: slug! })
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

  // ── Prod path: Modal worker ───────────────────────────────────────────────
  if (!process.env.MODAL_WEBHOOK_URL) {
    return NextResponse.json({ error: 'MODAL_WEBHOOK_URL no configurado' }, { status: 500 })
  }

  // audioKey is set when the client uploaded the file directly to R2 via presigned URL
  const audioKey = (formData.get('audioKey') as string | null)?.trim()
  const presetJobId = (formData.get('jobId') as string | null)?.trim()
  const jobId = presetJobId ?? crypto.randomUUID()

  let audioUrl: string = youtubeUrl ?? ''
  if (audioKey) {
    audioUrl = `${process.env.NEXT_PUBLIC_R2_URL}/${audioKey}`
  }

  let chordsKey: string | undefined
  try {
    if (chordsFile instanceof File && chordsFile.size > 0) {
      const chordsBuffer = Buffer.from(await chordsFile.arrayBuffer())
      chordsKey = `songs/${slug}/${path.basename(chordsFile.name)}`
      await uploadToR2(chordsKey, chordsBuffer, 'application/pdf')
    }
  } catch {
    return NextResponse.json({ error: 'Error subiendo acordes a R2' }, { status: 500 })
  }

  try {
    const modalRes = await fetch(process.env.MODAL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl, jobId, slug, title, artist, bpm, chordsKey }),
    })

    if (!modalRes.ok) {
      console.error('Modal error:', await modalRes.text())
      return NextResponse.json({ error: 'Error al iniciar job en Modal' }, { status: 502 })
    }
  } catch (err) {
    console.error('Modal fetch error:', err)
    return NextResponse.json({ error: 'No se pudo conectar con Modal' }, { status: 502 })
  }

  return NextResponse.json({ jobId })
}
