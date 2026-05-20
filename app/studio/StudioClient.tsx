'use client'

import { useRef, useState } from 'react'
import { X, ArrowLeft, Music, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { SSEEvent } from '@/lib/types'
import { parseETA, inferPhase } from '@/lib/studio'

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 w-full'

export default function StudioClient() {
  const songInputRef = useRef<HTMLInputElement>(null)
  const chordsInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [bpm, setBpm] = useState('')
  const [id, setId] = useState('')
  const [songFile, setSongFile] = useState<File | null>(null)
  const [chordsFile, setChordsFile] = useState<File | null>(null)
  const [youtubeMode, setYoutubeMode] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')

  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [lastLog, setLastLog] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string; id?: string } | null>(null)

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!id || id === slugify(title)) setId(slugify(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !title || !artist) {
      setResult({ ok: false, message: 'Completá título, artista e ID.' })
      return
    }
    if (youtubeMode && !youtubeUrl.trim()) {
      setResult({ ok: false, message: 'Pegá una URL de YouTube.' })
      return
    }
    if (!youtubeMode && !songFile) {
      setResult({ ok: false, message: 'Seleccioná un archivo MP3.' })
      return
    }

    setSaving(true)
    setPhase(youtubeMode ? 'Conectando con YouTube...' : 'Subiendo archivo...')
    setProgress(null)
    setLastLog('')
    setResult(null)

    const fd = new FormData()
    fd.append('id', id)
    fd.append('title', title)
    fd.append('artist', artist)
    if (bpm) fd.append('bpm', bpm)
    if (youtubeMode) {
      fd.append('youtubeUrl', youtubeUrl.trim())
    } else {
      fd.append('song', songFile!, songFile!.name)
    }
    if (chordsFile) fd.append('chords', chordsFile, chordsFile.name)

    let res: Response
    try {
      res = await fetch('/api/studio', { method: 'POST', body: fd })
    } catch {
      setResult({ ok: false, message: 'No se pudo conectar con /api/studio' })
      setSaving(false)
      return
    }

    // Validation errors come back as JSON (non-streaming)
    if (!res.headers.get('content-type')?.includes('text/event-stream')) {
      const data = (await res.json()) as { error?: string }
      setResult({ ok: false, message: data.error ?? 'Error desconocido' })
      setSaving(false)
      return
    }

    // Read SSE stream
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE events (separated by \n\n)
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        const dataLine = event.split('\n').find((l) => l.startsWith('data: '))
        if (!dataLine) continue
        let ev: SSEEvent
        try {
          ev = JSON.parse(dataLine.slice(6)) as SSEEvent
        } catch {
          continue
        }

        if (ev.type === 'progress') {
          setProgress(ev.pct)
          setLastLog(parseETA(ev.text) ?? '')
        } else if (ev.type === 'log') {
          setLastLog(ev.text)
          const newPhase = inferPhase(ev.text)
          if (newPhase) {
            setPhase(newPhase)
            // Reset progress bar when phase changes (e.g. download → separation)
            if (newPhase.includes('Separando') || newPhase.includes('Descargando')) {
              setProgress(null)
            }
          }
        } else if (ev.type === 'done') {
          setResult({ ok: true, message: '', id: ev.id })
          setSaving(false)
        } else if (ev.type === 'error') {
          setResult({ ok: false, message: ev.message })
          setSaving(false)
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-zinc-900 px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-1">
          <ArrowLeft size={14} /> Volver
        </Link>
        <h1 className="text-2xl font-bold text-white">Studio</h1>
        <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full font-mono">
          dev only
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Metadata */}
        <section className="flex flex-col gap-4 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300">Información</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Título">
              <input
                className={inputCls}
                placeholder="Bohemian Rhapsody"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                required
              />
            </Field>
            <Field label="Artista">
              <input
                className={inputCls}
                placeholder="Queen"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID (slug)">
              <input
                className={inputCls}
                placeholder="bohemian-rhapsody"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                pattern="[a-z0-9-]+"
                required
              />
            </Field>
            <Field label="BPM (opcional)">
              <input
                className={inputCls}
                type="number"
                placeholder="120"
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                min={1}
                max={300}
              />
            </Field>
          </div>
        </section>

        {/* Song */}
        <section className="flex flex-col gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">Canción</h2>
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
              <button
                type="button"
                onClick={() => setYoutubeMode(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${!youtubeMode ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
              >
                <Music size={12} /> MP3
              </button>
              <button
                type="button"
                onClick={() => setYoutubeMode(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${youtubeMode ? 'bg-red-700 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
              >
                <ExternalLink size={12} /> YouTube
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Demucs va a separar la pista en{' '}
            <span className="text-zinc-400">Voz</span> e{' '}
            <span className="text-zinc-400">Instrumental</span> automáticamente.
          </p>

          {youtubeMode ? (
            <input
              type="url"
              className={inputCls}
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
          ) : (
            <>
              <input
                ref={songInputRef}
                type="file"
                accept="audio/mpeg,.mp3"
                className="hidden"
                onChange={(e) => setSongFile(e.target.files?.[0] ?? null)}
              />
              {songFile ? (
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2.5">
                  <Music size={14} className="text-green-400 flex-shrink-0" />
                  <span className="text-sm text-green-400 flex-1 truncate">{songFile.name}</span>
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {(songFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSongFile(null); if (songInputRef.current) songInputRef.current.value = '' }}
                    className="text-zinc-500 hover:text-red-400 flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => songInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-600 rounded-lg py-6 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 transition-colors"
                >
                  Seleccionar MP3...
                </button>
              )}
            </>
          )}
        </section>

        {/* Chords PDF */}
        <section className="flex flex-col gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300">Acordes (PDF) — opcional</h2>
          <input
            ref={chordsInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => setChordsFile(e.target.files?.[0] ?? null)}
          />
          {chordsFile ? (
            <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
              <span className="text-sm text-green-400 flex-1 truncate">{chordsFile.name}</span>
              <button
                type="button"
                onClick={() => { setChordsFile(null); if (chordsInputRef.current) chordsInputRef.current.value = '' }}
                className="text-zinc-500 hover:text-red-400"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => chordsInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-600 rounded-lg py-4 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 transition-colors"
            >
              Seleccionar PDF...
            </button>
          )}
        </section>

        {/* Submit */}
        <div className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={saving}
            className="h-12 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:opacity-50 text-black font-semibold text-sm transition-colors"
          >
            {saving ? 'Procesando...' : 'Procesar y guardar'}
          </button>

          {/* Progress panel */}
          {saving && (
            <div className="flex flex-col gap-2.5 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
              <p className="text-sm font-medium text-zinc-300">{phase || 'Procesando...'}</p>

              {progress !== null && (
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-2 rounded-full bg-zinc-700 overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-zinc-400 w-8 text-right">{progress}%</span>
                </div>
              )}

              {lastLog && (
                <p className="text-xs font-mono text-zinc-500 truncate" title={lastLog}>
                  {lastLog}
                </p>
              )}
            </div>
          )}

          {result && (
            <div
              className={`rounded-xl p-4 text-sm ${
                result.ok ? 'bg-green-950 text-green-300' : 'bg-red-950 text-red-300'
              }`}
            >
              {result.ok ? (
                <span>
                  Canción guardada en R2 y Convex.{' '}
                  <Link href="/" className="underline hover:text-green-200">Ver lista</Link>{' '}
                  ·{' '}
                  <Link href={`/songs/${result.id}`} className="underline hover:text-green-200">Abrir player</Link>
                </span>
              ) : (
                result.message
              )}
            </div>
          )}
        </div>
      </form>
    </main>
  )
}
