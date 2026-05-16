'use client'

import { useId, useRef, useState } from 'react'
import type { Marker, Region, Track } from '@/lib/types'
import Link from 'next/link'

interface TrackEntry {
  file: File
  label: string
  defaultVolume: number
}

interface MarkerEntry extends Marker {
  _key: number
}

interface RegionEntry extends Region {
  _key: number
}

let _seq = 0
const nextKey = () => ++_seq

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 w-full'

export default function StudioClient() {
  const fileInputId = useId()
  const chordsInputId = useId()

  // Basic metadata
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [bpm, setBpm] = useState('')

  // Tracks
  const [tracks, setTracks] = useState<TrackEntry[]>([])

  // Chords PDF
  const [chordsFile, setChordsFile] = useState<File | null>(null)

  // Markers
  const [markers, setMarkers] = useState<MarkerEntry[]>([])

  // Regions
  const [regions, setRegions] = useState<RegionEntry[]>([])

  // Submit state
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; id?: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chordsInputRef = useRef<HTMLInputElement>(null)

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!id || id === slugify(title)) setId(slugify(value))
  }

  function handleTrackFiles(files: FileList | null) {
    if (!files) return
    const entries: TrackEntry[] = Array.from(files).map((f) => ({
      file: f,
      label: f.name.replace(/\.[^.]+$/, ''),
      defaultVolume: 1.0,
    }))
    setTracks((prev) => [...prev, ...entries])
  }

  function updateTrack(index: number, patch: Partial<Omit<TrackEntry, 'file'>>) {
    setTracks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  }

  function removeTrack(index: number) {
    setTracks((prev) => prev.filter((_, i) => i !== index))
  }

  function addMarker() {
    setMarkers((prev) => [...prev, { _key: nextKey(), time: 0, label: '' }])
  }

  function updateMarker(key: number, patch: Partial<Marker>) {
    setMarkers((prev) => prev.map((m) => (m._key === key ? { ...m, ...patch } : m)))
  }

  function removeMarker(key: number) {
    setMarkers((prev) => prev.filter((m) => m._key !== key))
  }

  function addRegion() {
    const k = nextKey()
    setRegions((prev) => [
      ...prev,
      { _key: k, id: `region-${k}`, label: '', start: 0, end: 30 },
    ])
  }

  function updateRegion(key: number, patch: Partial<Region>) {
    setRegions((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }

  function removeRegion(key: number) {
    setRegions((prev) => prev.filter((r) => r._key !== key))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !title || !artist || tracks.length === 0) {
      setResult({ ok: false, message: 'Completa ID, título, artista y al menos una pista.' })
      return
    }

    setSaving(true)
    setResult(null)

    const metaTracks: Track[] = tracks.map((t, i) => ({
      id: slugify(t.label) || `track-${i}`,
      label: t.label,
      file: t.file.name,
      defaultVolume: t.defaultVolume,
    }))

    const meta = {
      id,
      title,
      artist,
      ...(bpm ? { bpm: parseInt(bpm, 10) } : {}),
      tracks: metaTracks,
      markers: markers.map(({ time, label }) => ({ time, label })),
      regions: regions.map(({ id: rid, label, start, end }) => ({ id: rid, label, start, end })),
      ...(chordsFile ? { chordsFile: chordsFile.name } : {}),
    }

    const fd = new FormData()
    fd.append('id', id)
    fd.append('metadata', JSON.stringify(meta))
    tracks.forEach((t) => fd.append('tracks', t.file, t.file.name))
    if (chordsFile) fd.append('chords', chordsFile, chordsFile.name)

    try {
      const res = await fetch('/api/studio', { method: 'POST', body: fd })
      const data = (await res.json()) as { ok?: boolean; error?: string; id?: string }
      if (data.ok) {
        setResult({ ok: true, message: `Guardado en public/songs/${id}/`, id })
      } else {
        setResult({ ok: false, message: data.error ?? 'Error desconocido' })
      }
    } catch {
      setResult({ ok: false, message: 'No se pudo conectar con /api/studio' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-900 px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold text-white">Studio</h1>
        <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full font-mono">
          dev only
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Basic info */}
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

        {/* Tracks */}
        <section className="flex flex-col gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">Pistas de audio</h2>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-green-400 hover:text-green-300"
            >
              + Agregar MP3
            </button>
          </div>

          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,.mp3"
            multiple
            className="hidden"
            onChange={(e) => handleTrackFiles(e.target.files)}
          />

          {tracks.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-600 rounded-lg py-6 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 transition-colors"
            >
              Seleccionar archivos MP3...
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              {tracks.map((t, i) => (
                <div key={i} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                  <span className="text-xs text-zinc-500 truncate flex-shrink-0 w-32">{t.file.name}</span>
                  <input
                    className="flex-1 bg-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="Label"
                    value={t.label}
                    onChange={(e) => updateTrack(i, { label: e.target.value })}
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-zinc-500">Vol</span>
                    <input
                      type="number"
                      className="w-14 bg-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                      min={0}
                      max={1}
                      step={0.1}
                      value={t.defaultVolume}
                      onChange={(e) => updateTrack(i, { defaultVolume: parseFloat(e.target.value) })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTrack(i)}
                    className="text-zinc-500 hover:text-red-400 text-lg leading-none flex-shrink-0"
                    aria-label="Eliminar pista"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Chords PDF */}
        <section className="flex flex-col gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300">Acordes (PDF) — opcional</h2>
          <input
            id={chordsInputId}
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
                className="text-zinc-500 hover:text-red-400 text-lg"
              >
                ✕
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

        {/* Markers */}
        <section className="flex flex-col gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">Markers</h2>
            <button type="button" onClick={addMarker} className="text-xs text-green-400 hover:text-green-300">
              + Añadir
            </button>
          </div>
          {markers.length === 0 && (
            <p className="text-xs text-zinc-600">Sin markers. Los markers marcan secciones en la waveform.</p>
          )}
          {markers.map((m) => (
            <div key={m._key} className="flex items-center gap-2">
              <input
                type="number"
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
                placeholder="seg"
                value={m.time}
                min={0}
                step={0.5}
                onChange={(e) => updateMarker(m._key, { time: parseFloat(e.target.value) || 0 })}
              />
              <input
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
                placeholder="Intro, Verso, Coro..."
                value={m.label}
                onChange={(e) => updateMarker(m._key, { label: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeMarker(m._key)}
                className="text-zinc-500 hover:text-red-400 text-lg"
              >
                ✕
              </button>
            </div>
          ))}
        </section>

        {/* Regions */}
        <section className="flex flex-col gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">Regiones de loop</h2>
            <button type="button" onClick={addRegion} className="text-xs text-green-400 hover:text-green-300">
              + Añadir
            </button>
          </div>
          {regions.length === 0 && (
            <p className="text-xs text-zinc-600">Sin regiones. Las regiones permiten hacer loop de una sección.</p>
          )}
          {regions.map((r) => (
            <div key={r._key} className="flex items-center gap-2 flex-wrap">
              <input
                className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
                placeholder="ID (slug)"
                value={r.id}
                onChange={(e) => updateRegion(r._key, { id: e.target.value })}
              />
              <input
                className="flex-1 min-w-[80px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
                placeholder="Coro"
                value={r.label}
                onChange={(e) => updateRegion(r._key, { label: e.target.value })}
              />
              <input
                type="number"
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
                placeholder="inicio"
                value={r.start}
                min={0}
                step={0.5}
                onChange={(e) => updateRegion(r._key, { start: parseFloat(e.target.value) || 0 })}
              />
              <input
                type="number"
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
                placeholder="fin"
                value={r.end}
                min={0}
                step={0.5}
                onChange={(e) => updateRegion(r._key, { end: parseFloat(e.target.value) || 0 })}
              />
              <button
                type="button"
                onClick={() => removeRegion(r._key)}
                className="text-zinc-500 hover:text-red-400 text-lg"
              >
                ✕
              </button>
            </div>
          ))}
        </section>

        {/* Submit */}
        <div className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={saving}
            className="h-12 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:opacity-50 text-black font-semibold text-sm transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar Proyecto'}
          </button>

          {result && (
            <div
              className={`rounded-xl p-4 text-sm ${
                result.ok
                  ? 'bg-green-950 text-green-300'
                  : 'bg-red-950 text-red-300'
              }`}
            >
              {result.ok ? (
                <span>
                  Guardado en <code className="font-mono">public/songs/{result.id}/</code>.{' '}
                  <Link href="/" className="underline hover:text-green-200">
                    Ver lista
                  </Link>{' '}
                  ·{' '}
                  <Link href={`/song/${result.id}`} className="underline hover:text-green-200">
                    Abrir player
                  </Link>
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
