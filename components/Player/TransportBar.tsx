'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, RotateCw, Loader2, Timer, Metronome, Repeat } from 'lucide-react'
import type { Marker, Section } from '@/lib/types'
import type { EngineState } from '@/hooks/useAudioEngine'
import { formatTime } from '@/lib/format'
import { UI } from '@/lib/constants'
import { Volume2, VolumeX } from 'lucide-react'

interface Props {
  state: EngineState
  currentTime: number
  duration: number
  markers: Marker[]
  sections: Section[]
  activeSectionId: string | null
  countingIn: boolean
  countInBeat: number
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onSkip: (delta: number) => void
  onSkipToMarker: (dir: -1 | 1) => void
  onSetActiveSection: (id: string | null) => void
  onCountIn: () => void
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
      className="h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40 transition-colors touch-manipulation text-zinc-300 select-none"
      aria-label={label}
    >
      {/* Flecha circular con los segundos adentro: deja claro que salta N s
          (mantener apretado sigue saltando al marcador). */}
      <span className="relative flex items-center justify-center">
        {dir === -1 ? <RotateCcw size={22} /> : <RotateCw size={22} />}
        <span className="absolute text-[9px] font-bold leading-none tabular-nums">
          {Math.abs(delta)}
        </span>
      </span>
    </button>
  )
}

/**
 * Volumen. De `md` para arriba el slider va inline en la fila; abajo no hay
 * ancho para sliders sin descentrar el transporte, así que se colapsa en un
 * botón que abre faders verticales — el global y, si está prendido, el del
 * metrónomo.
 */
function VolumeControl({
  volume,
  onChange,
  metronomeOn,
  metronomeVolume,
  onMetronomeVolumeChange,
}: {
  volume: number
  onChange: (v: number) => void
  metronomeOn: boolean
  metronomeVolume: number
  onMetronomeVolumeChange: (v: number) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const Icon = volume === 0 ? VolumeX : Volume2

  const slider = (width: string) => (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={volume}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`slider-thumb ${width} h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation`}
      style={{
        background: `linear-gradient(to right, #4ade80 ${volume * 100}%, #3f3f46 ${volume * 100}%)`,
        '--thumb': '#4ade80',
      } as React.CSSProperties}
      aria-label="Volumen global"
    />
  )

  const muteButton = (
    <button
      onClick={() => onChange(volume > 0 ? 0 : 1)}
      className="flex-shrink-0 text-zinc-400 hover:text-zinc-200 touch-manipulation transition-colors"
      aria-label={volume === 0 ? 'Restaurar volumen' : 'Silenciar todo'}
      title="Volumen global"
    >
      <Icon size={15} />
    </button>
  )

  // Faders verticales, igual que los de cada pista en la waveform.
  const fader = (
    value: number,
    onValueChange: (v: number) => void,
    accent: string,
    label: string
  ) => (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={(e) => onValueChange(parseFloat(e.target.value))}
      className="cursor-pointer touch-manipulation"
      style={{
        writingMode: 'vertical-lr' as const,
        direction: 'rtl',
        width: '20px',
        height: '112px',
        accentColor: accent,
      }}
      aria-label={label}
    />
  )

  return (
    <>
      <div className="hidden md:flex items-center gap-1.5 min-w-0">
        {muteButton}
        {slider('w-20')}
      </div>

      <div ref={wrapRef} className="relative md:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Volumen"
          className={`h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 flex items-center justify-center rounded-full transition-colors touch-manipulation ${
            open ? 'bg-zinc-700 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          }`}
        >
          <Icon size={18} />
        </button>

        {/* El volumen del metrónomo vive acá abajo de `md`: en la fila no entra
            junto a los seis botones sin descentrar el transporte. */}
        {open && (
          <div className="absolute bottom-full right-0 z-30 mb-2 flex items-end gap-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3">
            <div className="flex flex-col items-center gap-2">
              {fader(volume, onChange, '#4ade80', 'Volumen global')}
              {muteButton}
            </div>

            {metronomeOn && (
              <div className="flex flex-col items-center gap-2">
                {fader(metronomeVolume, onMetronomeVolumeChange, '#f59e0b', 'Volumen metrónomo')}
                <Metronome size={15} className="text-amber-500" />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default function TransportBar({
  state,
  currentTime,
  duration,
  markers,
  sections,
  activeSectionId,
  countingIn,
  countInBeat,
  onPlay,
  onPause,
  onSeek,
  onSkip,
  onSkipToMarker,
  onSetActiveSection,
  onCountIn,
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
          className="slider-thumb flex-1 h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation disabled:opacity-40"
          style={{
            background: `linear-gradient(to right, #4ade80 ${(currentTime / (duration || 1)) * 100}%, #52525b ${(currentTime / (duration || 1)) * 100}%)`,
            '--thumb': '#4ade80',
          } as React.CSSProperties}
          aria-label="Posición"
        />
        <span className="text-xs text-zinc-400 w-9 tabular-nums">{formatTime(duration)}</span>
      </div>

      {/* Controles. Grid de 3 columnas: las dos laterales son 1fr, así que miden
          igual y la celda del medio cae siempre en el centro real del
          contenedor. El play no se mueve cuando aparece el slider del metrónomo
          ni cuando cambian los costados. */}
      <div className="grid items-center gap-1.5 sm:gap-2 grid-cols-[1fr_auto_1fr]">
        {/* Herramientas de práctica */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Count-in / claqueta */}
          <button
            onClick={onCountIn}
            disabled={isDisabled && !countingIn}
            className={`h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 flex items-center justify-center rounded-full transition-colors touch-manipulation text-sm select-none ${
              countingIn
                ? 'bg-amber-500 text-black font-bold text-lg'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40'
            }`}
            aria-label="Claqueta (4 tiempos)"
            title="Tap: count-in de 4 tiempos al BPM"
          >
            {countingIn ? countInBeat : <Timer size={18} />}
          </button>

          {/* Metronome toggle + volume */}
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={onToggleMetronome}
              disabled={isDisabled}
              className={`h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 flex items-center justify-center rounded-full transition-colors touch-manipulation text-sm select-none ${
                metronomeOn
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40'
              }`}
              aria-label="Metrónomo"
              title="Metrónomo continuo"
            >
              <Metronome size={18} />
            </button>
            {metronomeOn && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={metronomeVolume}
                onChange={(e) => onMetronomeVolumeChange(parseFloat(e.target.value))}
                className="slider-thumb hidden md:block w-16 h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation"
                style={{
                  background: `linear-gradient(to right, #f59e0b ${metronomeVolume * 100}%, #3f3f46 ${metronomeVolume * 100}%)`,
                  '--thumb': '#f59e0b',
                } as React.CSSProperties}
                aria-label="Volumen metrónomo"
              />
            )}
          </div>
        </div>

        {/* Transporte: un botón de cada lado del play */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
          <SkipButton
            label="Retroceder 5s"
            delta={-5}
            dir={-1}
            onSkip={onSkip}
            onSkipToMarker={onSkipToMarker}
            disabled={isDisabled}
          />

          <button
            onClick={isPlaying ? onPause : onPlay}
            disabled={isLoading}
            className="h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:opacity-40 transition-colors touch-manipulation text-black text-2xl select-none"
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

          <SkipButton
            label="Avanzar 5s"
            delta={5}
            dir={1}
            onSkip={onSkip}
            onSkipToMarker={onSkipToMarker}
            disabled={isDisabled}
          />
        </div>

        {/* Volumen global */}
        <div className="flex items-center justify-end min-w-0">
          <VolumeControl
            volume={globalVolume}
            onChange={onGlobalVolumeChange}
            metronomeOn={metronomeOn}
            metronomeVolume={metronomeVolume}
            onMetronomeVolumeChange={onMetronomeVolumeChange}
          />
        </div>
      </div>

      {/* Regiones en su propia fila: antes se appendeaban al transporte y con
          tres o cuatro el flex-wrap arrastraba al resto de los controles. */}
      {sections.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {sections.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSetActiveSection(activeSectionId === r.id ? null : r.id)
                onSeek(r.start)
              }}
              className={`h-9 px-3 rounded-full text-xs font-medium transition-colors touch-manipulation ${
                activeSectionId === r.id
                  ? 'bg-green-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {activeSectionId === r.id && <Repeat size={12} className="mr-1" />}{r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
