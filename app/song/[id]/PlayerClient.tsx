'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import { usePlayerState } from '@/hooks/usePlayerState'
import MultiTrackWaveform from '@/components/Player/MultiTrackWaveform'
import TransportBar from '@/components/Player/TransportBar'
import SongSidebar from '@/components/Player/SongSidebar'
import ChordsPanel from '@/components/Player/ChordsPanel'
import BpmTapModal from '@/components/Player/BpmTapModal'
import MarkersSection from '@/components/Player/MarkersSection'
import type { Marker, SongIndex, SongMeta } from '@/lib/types'

interface Props {
  meta: SongMeta
  songs: SongIndex[]
}

function playCountIn(
  ctx: AudioContext,
  bpm: number,
  onBeat: (beat: number) => void,
  onDone: () => void
) {
  const beatDuration = 60 / bpm
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    const t = ctx.currentTime + i * beatDuration
    osc.frequency.value = i === 0 ? 1000 : 800
    gain.gain.setValueAtTime(0.4, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    osc.start(t)
    osc.stop(t + 0.06)
    setTimeout(() => onBeat(4 - i), i * beatDuration * 1000)
  }
  setTimeout(onDone, 4 * beatDuration * 1000)
}

export default function PlayerClient({ meta, songs }: Props) {
  const engine = useAudioEngine({ songId: meta.id, tracks: meta.tracks })
  const { persisted, save } = usePlayerState(meta.id)

  const [chordsOpen, setChordsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null)
  const [localMarkers, setLocalMarkers] = useState<Marker[]>([])
  const [countingIn, setCountingIn] = useState(false)
  const [countInBeat, setCountInBeat] = useState(4)
  const [localBpm, setLocalBpm] = useState<number | null>(null)
  const [tapModalOpen, setTapModalOpen] = useState(false)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [metronomeVolume, setMetronomeVolume] = useState(0.7)
  const [markersSectionOpen, setMarkersSectionOpen] = useState(false)

  const markerCountRef = useRef(0)
  const metronomeRef = useRef<{ nextBeatTime: number; timerId: ReturnType<typeof setTimeout> | null }>({
    nextBeatTime: 0,
    timerId: null,
  })

  // Hidratar desde localStorage
  useEffect(() => {
    if (engine.state !== 'ready') return
    if (persisted.lastPosition > 0) engine.seek(persisted.lastPosition)
    Object.entries(persisted.volumes).forEach(([trackId, vol]) => {
      const idx = meta.tracks.findIndex((t) => t.id === trackId)
      if (idx >= 0) engine.setVolume(idx, vol)
    })
    setActiveRegionId(persisted.activeRegionId)
    if (persisted.localMarkers.length > 0) {
      setLocalMarkers(persisted.localMarkers)
      markerCountRef.current = persisted.localMarkers.length
    }
    if (persisted.localBpm) setLocalBpm(persisted.localBpm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.state])

  // Persistir posición mientras suena
  useEffect(() => {
    if (engine.state !== 'playing') return
    const t = setInterval(() => save({ lastPosition: engine.currentTime }), 2000)
    return () => clearInterval(t)
  }, [engine.state, engine.currentTime, save])

  const handleVolumeChange = useCallback(
    (index: number, value: number) => {
      engine.setVolume(index, value)
      save({ volumes: { ...persisted.volumes, [meta.tracks[index].id]: value } })
    },
    [engine, meta.tracks, persisted.volumes, save]
  )

  const handleSetActiveRegion = useCallback(
    (id: string | null) => {
      setActiveRegionId(id)
      save({ activeRegionId: id })
    },
    [save]
  )

  const handleRegionLoop = useCallback((start: number) => engine.seek(start), [engine])

  const handleSkip = useCallback(
    (delta: number) => {
      engine.seek(Math.max(0, Math.min(engine.currentTime + delta, engine.duration)))
    },
    [engine]
  )

  const allMarkers = [...meta.markers, ...localMarkers]

  const handleSkipToMarker = useCallback(
    (dir: -1 | 1) => {
      const sorted = [...allMarkers].sort((a, b) => a.time - b.time)
      if (dir === -1) {
        const prev = [...sorted].reverse().find((m) => m.time < engine.currentTime - 0.5)
        if (prev) engine.seek(prev.time)
      } else {
        const next = sorted.find((m) => m.time > engine.currentTime + 0.5)
        if (next) engine.seek(next.time)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, allMarkers]
  )

  const handleAddMarker = useCallback((trackIndex: number) => {
    markerCountRef.current += 1
    const marker: Marker = {
      time: Math.round(engine.currentTime * 10) / 10,
      label: `M${markerCountRef.current}`,
      trackIndex,
    }
    const updated = [...localMarkers, marker]
    setLocalMarkers(updated)
    save({ localMarkers: updated })
  }, [engine.currentTime, localMarkers, save])

  const handleEditMarker = useCallback((index: number, label: string, trackIndex: number | undefined) => {
    const updated = localMarkers.map((m, i) => i === index ? { ...m, label, trackIndex } : m)
    setLocalMarkers(updated)
    save({ localMarkers: updated })
  }, [localMarkers, save])

  const handleDeleteMarker = useCallback((index: number) => {
    const updated = localMarkers.filter((_, i) => i !== index)
    setLocalMarkers(updated)
    save({ localMarkers: updated })
  }, [localMarkers, save])

  const handleConfirmBpm = useCallback((bpm: number) => {
    setLocalBpm(bpm)
    save({ localBpm: bpm })
  }, [save])

  const effectiveBpm = localBpm ?? meta.bpm ?? 80

  // Metronome scheduling — must be after effectiveBpm
  useEffect(() => {
    const state = engine.state
    const ctx = engine.getContext()
    if (!metronomeOn || state !== 'playing' || !ctx) {
      if (metronomeRef.current.timerId) {
        clearTimeout(metronomeRef.current.timerId)
        metronomeRef.current.timerId = null
      }
      return
    }

    const beatDuration = 60 / effectiveBpm
    const scheduleAhead = 0.1
    const lookahead = 25

    function scheduleTick() {
      const now = ctx!.currentTime
      while (metronomeRef.current.nextBeatTime < now + scheduleAhead) {
        const t = metronomeRef.current.nextBeatTime
        if (t >= now) {
          const osc = ctx!.createOscillator()
          const gain = ctx!.createGain()
          osc.connect(gain)
          gain.connect(ctx!.destination)
          osc.frequency.value = 800
          gain.gain.setValueAtTime(metronomeVolume, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
          osc.start(t)
          osc.stop(t + 0.08)
        }
        metronomeRef.current.nextBeatTime += beatDuration
      }
      metronomeRef.current.timerId = setTimeout(scheduleTick, lookahead)
    }

    metronomeRef.current.nextBeatTime = ctx.currentTime
    scheduleTick()

    return () => {
      if (metronomeRef.current.timerId) {
        clearTimeout(metronomeRef.current.timerId)
        metronomeRef.current.timerId = null
      }
    }
  }, [metronomeOn, engine.state, effectiveBpm, metronomeVolume]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCountIn = useCallback(() => {
    const ctx = engine.getContext()
    if (!ctx || countingIn) return

    // Stop any playing/suspended sources so they don't bleed when ctx resumes
    engine.releaseSources()
    setCountingIn(true)
    setCountInBeat(4)

    const doCountIn = () => {
      playCountIn(
        ctx,
        effectiveBpm,
        (beat) => setCountInBeat(beat),
        () => {
          setCountingIn(false)
          engine.play()
        }
      )
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(doCountIn)
    } else {
      doCountIn()
    }
  }, [engine, effectiveBpm, countingIn])

  return (
    <div className="flex h-dvh bg-zinc-900 overflow-hidden">
      <SongSidebar
        songs={songs}
        currentId={meta.id}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 touch-manipulation flex-shrink-0"
            aria-label="Canciones"
          >
            ☰
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-white truncate leading-tight">{meta.title}</h1>
            <p className="text-xs text-zinc-500 truncate">
              {meta.artist}
            </p>
          </div>

          {/* Tap BPM button → opens modal */}
          <button
            onClick={() => setTapModalOpen(true)}
            className="flex-shrink-0 h-8 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-xs text-zinc-300 touch-manipulation tabular-nums transition-colors"
            title="Detectar BPM tappeando al ritmo"
          >
            {effectiveBpm !== 80 || localBpm ? `${effectiveBpm} bpm` : 'TAP bpm'}
          </button>

          {meta.chordsFile && (
            <button
              onClick={() => setChordsOpen(true)}
              className="flex-shrink-0 h-8 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 touch-manipulation"
            >
              Acordes
            </button>
          )}
        </header>

        {/* Waveforms — fills available vertical space */}
        <div className="flex-1 min-h-0 px-3 py-3">
          <MultiTrackWaveform
            songId={meta.id}
            tracks={meta.tracks}
            markers={allMarkers}
            regions={meta.regions}
            activeRegionId={activeRegionId}
            currentTime={engine.currentTime}
            duration={engine.duration}
            volumes={engine.volumes}
            onSeek={engine.seek}
            onVolumeChange={handleVolumeChange}
            onRegionLoop={handleRegionLoop}
            onSetActiveRegion={handleSetActiveRegion}
          />
        </div>

        {/* Markers section */}
        <MarkersSection
          isOpen={markersSectionOpen}
          onToggle={() => setMarkersSectionOpen((v) => !v)}
          metaMarkers={meta.markers}
          localMarkers={localMarkers}
          tracks={meta.tracks}
          onSeek={engine.seek}
          onEditMarker={handleEditMarker}
          onDelete={handleDeleteMarker}
        />

        {/* Transport */}
        <div className="flex-shrink-0 px-3 pb-5 pt-2 border-t border-zinc-800">
          <TransportBar
            state={engine.state}
            currentTime={engine.currentTime}
            duration={engine.duration}
            markers={allMarkers}
            regions={meta.regions}
            activeRegionId={activeRegionId}
            countingIn={countingIn}
            countInBeat={countInBeat}
            onPlay={engine.play}
            onPause={engine.pause}
            onSeek={engine.seek}
            onSkip={handleSkip}
            onSkipToMarker={handleSkipToMarker}
            onSetActiveRegion={handleSetActiveRegion}
            onCountIn={handleCountIn}
            tracks={meta.tracks}
            onAddMarker={handleAddMarker}
            metronomeOn={metronomeOn}
            onToggleMetronome={() => setMetronomeOn((v) => !v)}
            metronomeVolume={metronomeVolume}
            onMetronomeVolumeChange={setMetronomeVolume}
          />
        </div>
      </div>

      {chordsOpen && meta.chordsFile && (
        <ChordsPanel
          songId={meta.id}
          chordsFile={meta.chordsFile}
          onClose={() => setChordsOpen(false)}
        />
      )}

      {tapModalOpen && (
        <BpmTapModal
          currentBpm={localBpm ?? meta.bpm ?? null}
          onConfirm={handleConfirmBpm}
          onClose={() => setTapModalOpen(false)}
        />
      )}

    </div>
  )
}
