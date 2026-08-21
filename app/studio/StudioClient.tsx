'use client'

import { useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { X, ArrowLeft, Music, ExternalLink, AudioLines } from 'lucide-react'
import Link from 'next/link'
import type { SSEEvent } from '@/lib/types'
import {
  parseETA,
  inferPhase,
  stemPlan,
  blockedStemMessage,
  STEM_OPTIONS,
  DEFAULT_STEM_MODE,
  type StemMode,
} from '@/lib/studio'

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

type Job = FunctionReturnType<typeof api.jobs.listRecent>[number]

const JOB_DOT: Record<Job['status'], string> = {
  pending: 'bg-zinc-500',
  running: 'bg-green-500 animate-pulse',
  done: 'bg-green-400',
  error: 'bg-red-500',
}

function JobRow({ job }: { job: Job }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className={`h-2 w-2 mt-1.5 rounded-full flex-shrink-0 ${JOB_DOT[job.status]}`} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-zinc-300 truncate">
          {job.title} <span className="text-zinc-600">· {job.stems} pistas</span>
        </span>
        {job.status === 'done' ? (
          <span className="text-xs text-green-400">
            Lista ·{' '}
            <Link href={`/songs/${job.slug}`} className="underline hover:text-green-300">
              Abrir player
            </Link>
          </span>
        ) : job.status === 'error' ? (
          <span className="text-xs text-red-400">{job.message ?? 'Falló la separación.'}</span>
        ) : (
          <span className="text-xs text-zinc-500">
            {job.status === 'pending' ? 'En cola...' : job.phase ?? 'Procesando...'}
          </span>
        )}
      </div>
    </div>
  )
}

export default function StudioClient({ isDev }: { isDev: boolean }) {
  const songs = useQuery(api.songs.listPublic)
  const artists = [...new Set((songs ?? []).map((s) => s.artist))].sort()

  const songInputRef = useRef<HTMLInputElement>(null)

  // Reemplaza al polling contra /api/studio/status: el estado de cada corrida vive
  // en Convex, así que se sigue viendo aunque se cierre la pestaña o se entre desde
  // otro dispositivo.
  const jobs = useQuery(api.jobs.listRecent) ?? []
  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running')
  const finishedJobs = jobs.filter((j) => j.status === 'done' || j.status === 'error').slice(0, 3)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [bpm, setBpm] = useState('')
  const [id, setId] = useState('')
  const [songFile, setSongFile] = useState<File | null>(null)
  const [youtubeMode, setYoutubeMode] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [stems, setStems] = useState<StemMode>(DEFAULT_STEM_MODE)
  const stemOption = STEM_OPTIONS.find((o) => o.value === stems) ?? STEM_OPTIONS[0]

  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [lastLog, setLastLog] = useState('')
  const [result, setResult] = useState<
    { ok: boolean; message: string; id?: string; replaced?: boolean } | null
  >(null)

  // El ID sale del título, así que volver a subir la misma canción cae siempre en el
  // slug que ya existe. Convex solo reemplaza si esta corrida trae más pistas que las
  // guardadas; el resto se avisa acá para no gastar una separación entera de gusto.
  const existingTracks = songs?.find((s) => s.id === id)?.trackCount
  const plan = stemPlan(existingTracks, stems)
  const blockedMsg =
    plan === 'blocked' && existingTracks !== undefined
      ? blockedStemMessage(existingTracks, stems)
      : null

  // jobs:start rechaza dos corridas sobre el mismo slug; esto es solo el aviso
  // temprano para no hacer subir un MP3 entero antes del 409.
  const busyMsg = activeJobs.some((j) => j.slug === id)
    ? `Ya hay una corrida procesando "${id}". Esperá a que termine.`
    : null
  const formError = blockedMsg ?? busyMsg

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!id || id === slugify(title)) setId(slugify(value))
  }

  function resetForm() {
    setTitle('')
    setArtist('')
    setBpm('')
    setId('')
    setSongFile(null)
    setYoutubeUrl('')
    if (songInputRef.current) songInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !title || !artist) {
      setResult({ ok: false, message: 'Completá título, artista e ID.' })
      return
    }
    if (formError) {
      setResult({ ok: false, message: formError })
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
    setPhase(youtubeMode ? 'Subiendo datos...' : 'Subiendo archivo a R2...')
    setProgress(null)
    setLastLog('')
    setResult(null)

    // In prod with an MP3, upload directly to R2 via presigned URL to bypass Vercel's 4.5MB limit
    let audioKey: string | undefined
    let presignedJobId: string | undefined
    if (!isDev && !youtubeMode && songFile) {
      try {
        const presignRes = await fetch('/api/studio/presign', { method: 'POST' })
        if (!presignRes.ok) {
          const { error } = await presignRes.json() as { error?: string }
          setResult({ ok: false, message: error ?? 'Error obteniendo URL de subida' })
          setSaving(false)
          return
        }
        const { uploadUrl, key, jobId: jid } = await presignRes.json() as { uploadUrl: string; key: string; jobId: string }
        audioKey = key
        presignedJobId = jid

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'audio/mpeg' },
          body: songFile,
        })
        if (!uploadRes.ok) {
          setResult({ ok: false, message: 'Error subiendo el archivo a R2' })
          setSaving(false)
          return
        }
      } catch {
        setResult({ ok: false, message: 'No se pudo subir el archivo' })
        setSaving(false)
        return
      }
      setPhase('Enviando a Modal...')
    }

    const fd = new FormData()
    fd.append('id', id)
    fd.append('title', title)
    fd.append('artist', artist)
    fd.append('stems', String(stems))
    if (bpm) fd.append('bpm', bpm)
    if (youtubeMode) {
      fd.append('youtubeUrl', youtubeUrl.trim())
    } else if (isDev) {
      fd.append('song', songFile!, songFile!.name)
    } else {
      fd.append('audioKey', audioKey!)
      fd.append('jobId', presignedJobId!)
    }

    let res: Response
    try {
      res = await fetch('/api/studio', { method: 'POST', body: fd })
    } catch {
      setResult({ ok: false, message: 'No se pudo conectar con /api/studio' })
      setSaving(false)
      return
    }

    // ── SSE path (dev) ────────────────────────────────────────────────────
    if (res.headers.get('content-type')?.includes('text/event-stream')) {
      setPhase('Iniciando Demucs...')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

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
              if (newPhase.includes('Separando') || newPhase.includes('Descargando')) {
                setProgress(null)
              }
            }
          } else if (ev.type === 'done') {
            setResult({ ok: true, message: '', id: ev.id, replaced: plan === 'replace' })
            setSaving(false)
            resetForm()
          } else if (ev.type === 'error') {
            setResult({ ok: false, message: ev.message })
            setSaving(false)
          }
        }
      }
      return
    }

    // ── Prod: la corrida sigue sola ───────────────────────────────────────
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      setResult({ ok: false, message: data.error ?? 'Error desconocido' })
      setSaving(false)
      return
    }

    // El job ya está en Convex (lo creó /api/studio antes de llamar a Modal), así
    // que a partir de acá lo muestra la live query. El form se libera enseguida:
    // se puede encolar otra canción o cerrar la pestaña sin perder nada.
    setSaving(false)
    resetForm()
  }

  return (
    <main className="min-h-screen bg-zinc-900 px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-1">
          <ArrowLeft size={14} /> Volver
        </Link>
        <h1 className="text-2xl font-bold text-white">Studio</h1>
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
                list="artists-list"
                required
              />
              <datalist id="artists-list">
                {artists.map((a) => <option key={a} value={a} />)}
              </datalist>
            </Field>
          </div>
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
        </section>

        {/* Song */}
        <section className="flex flex-col gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">Canción</h2>
            {isDev && (
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
            )}
          </div>
          {/* Cantidad de stems: anda igual en dev (script local) y en prod (worker
              de Modal). Los dos resuelven el layout de pistas a partir del mismo
              número, así que no hay nada que gatear por entorno. */}
          <div className="flex self-start rounded-lg overflow-hidden border border-zinc-700 text-xs">
            {STEM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStems(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  stems === opt.value ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                <AudioLines size={12} /> {opt.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-zinc-500">
            Demucs va a separar la pista en{' '}
            <span className="text-zinc-400">{stemOption.names.join(' · ')}</span> automáticamente.
          </p>
          {stems !== DEFAULT_STEM_MODE && (
            <p className="text-xs text-amber-500/80">
              Separar tarda lo mismo, pero el player descarga y decodifica el doble de audio al abrir la canción.
            </p>
          )}
          {formError ? (
            <p className="text-xs text-red-400">{formError}</p>
          ) : plan === 'replace' && existingTracks !== undefined ? (
            <p className="text-xs text-amber-500/80">
              Ese ID ya existe con {existingTracks} pistas: se reemplazan por {stems} y las
              viejas se borran de R2.
            </p>
          ) : null}

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

        {/* Submit */}
        <div className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={saving || formError !== null}
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
                  {result.replaced
                    ? 'Pistas reemplazadas en R2 y Convex.'
                    : 'Canción guardada en R2 y Convex.'}{' '}
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

      {(activeJobs.length > 0 || finishedJobs.length > 0) && (
        <section className="flex flex-col gap-3 p-4 mt-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300">Corridas</h2>
          {activeJobs.map((job) => <JobRow key={job.jobId} job={job} />)}
          {finishedJobs.map((job) => <JobRow key={job.jobId} job={job} />)}
          {activeJobs.length > 0 && (
            <p className="text-xs text-zinc-500">
              Siguen solas: podés cerrar esta pestaña y volver cuando quieras.
            </p>
          )}
        </section>
      )}
    </main>
  )
}
