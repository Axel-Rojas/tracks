'use client'

import { useRef } from 'react'
import { Play, Pause, SkipBack, SkipForward, Loader2, Music, Drum, Repeat, Plus } from 'lucide-react'
import type { Marker, Region, Track } from '@/lib/types'
import type { EngineState } from '@/hooks/useAudioEngine'
import { TRACK_COLORS } from '@/lib/colors'
import { formatTime } from '@/lib/format'
import { UI } from '@/lib/constants'
import { Volume2, VolumeX } from 'lucide-react'

interface Props {
  state: EngineState
  currentTime: number
  duration: number
  markers: Marker[]
  regions: Region[]
  activeRegionId: string | null
  countingIn: boolean
  countInBeat: number
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onSkip: (delta: number) => void
  onSkipToMarker: (dir: -1 | 1) => void
  onSetActiveRegion: (id: string | null) => void
  onCountIn: () => void
  tracks?: Track[]
  onAddMarker?: (trackIndex: number) => void
  metronomeOn: boolean
  onToggleMetronome: () => void
  metronomeVolume: number
  onMetronomeVolumeChange: (v: number) => void
  globalVolume: number
  onGlobalVolumeChange: (v: number) => void
  loadingProgress?: number[]
}

function SkipButton({
  label,
  delta,
  dir,
  onSkip,
  onSkipToMarker,
  disabled,
}: {
  label: string
  delta: number
  dir: -1 | 1
  onSkip: (d: number) => void
  onSkipToMarker: (d: -1 | 1) => void
  disabled: boolean
}) {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  function onPointerDown() {
    firedRef.current = false
    holdRef.current = setTimeout(() => {
      firedRef.current = true
      onSkipToMarker(dir)
    }, UI.SKIP_HOLD_MS)
  }

  function onPointerUp() {
    if (holdRef.current) clearTimeout(holdRef.current)
    if (!firedRef.current) onSkip(delta)
    firedRef.current = false
  }

  function onPointerLeave() {
    if (holdRef.current) clearTimeout(holdRef.current)
    firedRef.current = false
  }

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      disabled={disabled}
      className="h-11 w-11 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40 transition-colors touch-manipulation text-zinc-300 select-none"
      aria-label={label}
    >
      {dir === -1 ? <SkipBack size={16} /> : <SkipForward size={16} />}
    </button>
  )
}

export default function TransportBar({
  state,
  currentTime,
  duration,
  markers,
  regions,
  activeRegionId,
  countingIn,
  countInBeat,
  onPlay,
  onPause,
  onSeek,
  onSkip,
  onSkipToMarker,
  onSetActiveRegion,
  onCountIn,
  tracks,
  onAddMarker,
  metronomeOn,
  onToggleMetronome,
  metronomeVolume,
  onMetronomeVolumeChange,
  globalVolume,
  onGlobalVolumeChange,
  loadingProgress,
}: Props) {
  const isPlaying = state === 'playing'
  const isLoading = state === 'loading' || state === 'idle'
  const isDisabled = isLoading || countingIn

  const overallProgress =
    loadingProgress && loadingProgress.length > 0
      ? loadingProgress.reduce((a, b) => a + b, 0) / loadingProgress.length
      : 0

  return (
    <div className="flex flex-col gap-2">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400 w-9 text-right tabular-nums">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          disabled={isDisabled}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation disabled:opacity-40"
          style={{
            background: `linear-gradient(to right, #4ade80 ${(currentTime / (duration || 1)) * 100}%, #52525b ${(currentTime / (duration || 1)) * 100}%)`,
          }}
          aria-label="Posición"
        />
        <span className="text-xs text-zinc-400 w-9 tabular-nums">{formatTime(duration)}</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {/* Skip back */}
        <SkipButton
          label="Retroceder 5s"
          delta={-5}
          dir={-1}
          onSkip={onSkip}
          onSkipToMarker={onSkipToMarker}
          disabled={isDisabled}
        />

        {/* Count-in / claqueta */}
        <button
          onClick={onCountIn}
          disabled={isDisabled && !countingIn}
          className={`h-11 w-11 flex items-center justify-center rounded-full transition-colors touch-manipulation text-sm select-none ${
            countingIn
              ? 'bg-amber-500 text-black font-bold text-lg'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40'
          }`}
          aria-label="Claqueta (4 tiempos)"
          title="Tap: count-in de 4 tiempos al BPM"
        >
          {countingIn ? countInBeat : <Music size={16} />}
        </button>

        {/* Metronome toggle + volume */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleMetronome}
            disabled={isDisabled}
            className={`h-11 w-11 flex items-center justify-center rounded-full transition-colors touch-manipulation text-sm select-none ${
              metronomeOn
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40'
            }`}
            aria-label="Metrónomo"
            title="Metrónomo continuo"
          >
            <Drum size={16} />
          </button>
          {metronomeOn && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={metronomeVolume}
              onChange={(e) => onMetronomeVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation"
              style={{
                background: `linear-gradient(to right, #f59e0b ${metronomeVolume * 100}%, #3f3f46 ${metronomeVolume * 100}%)`,
              }}
              aria-label="Volumen metrónomo"
            />
          )}
        </div>

        {/* Play / Pause */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          disabled={isLoading}
          className="h-14 w-14 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:opacity-40 transition-colors touch-manipulation text-black text-2xl select-none"
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-0.5">
              <Loader2 size={20} className="animate-spin" />
              {overallProgress > 0 && (
                <span className="text-[9px] tabular-nums leading-none text-zinc-900">
                  {Math.round(overallProgress * 100)}%
                </span>
              )}
            </div>
          ) : isPlaying ? (
            <Pause size={24} />
          ) : (
            <Play size={24} />
          )}
        </button>

        {/* Skip forward */}
        <SkipButton
          label="Avanzar 5s"
          delta={5}
          dir={1}
          onSkip={onSkip}
          onSkipToMarker={onSkipToMarker}
          disabled={isDisabled}
        />

        {/* Global volume */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onGlobalVolumeChange(globalVolume > 0 ? 0 : 1)}
            className="text-zinc-400 hover:text-zinc-200 touch-manipulation transition-colors"
            aria-label="Silenciar todo"
            title="Volumen global"
          >
            {globalVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={globalVolume}
            onChange={(e) => onGlobalVolumeChange(parseFloat(e.target.value))}
            className="w-20 h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation"
            style={{
              background: `linear-gradient(to right, #a1a1aa ${globalVolume * 100}%, #3f3f46 ${globalVolume * 100}%)`,
            }}
            aria-label="Volumen global"
          />
        </div>

        {/* Separator */}
        <div className="w-px h-8 bg-zinc-700 mx-1" />

        {/* Region buttons */}
        {regions.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              onSetActiveRegion(activeRegionId === r.id ? null : r.id)
              onSeek(r.start)
            }}
            className={`h-9 px-3 rounded-full text-xs font-medium transition-colors touch-manipulation ${
              activeRegionId === r.id
                ? 'bg-green-500 text-black'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {activeRegionId === r.id && <Repeat size={12} className="mr-1" />}{r.label}
          </button>
        ))}

        {/* Add marker per track */}
        {(tracks ?? []).map((track, i) => {
          const color = TRACK_COLORS[i % TRACK_COLORS.length].progress
          return (
            <button
              key={track.id}
              onClick={() => onAddMarker?.(i)}
              disabled={isDisabled}
              className="h-9 px-3 rounded-full text-xs font-medium touch-manipulation disabled:opacity-40 transition-opacity border"
              style={{
                color,
                borderColor: `${color}55`,
                background: `${color}15`,
              }}
            >
              <Plus size={12} className="mr-0.5" />{track.label}
            </button>
          )
        })}

      </div>
    </div>
  )
}
