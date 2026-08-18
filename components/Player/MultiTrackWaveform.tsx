'use client'

import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { Marker, Section, Track } from '@/lib/types'
import type { EngineState } from '@/hooks/useAudioEngine'
import { TRACK_COLORS } from '@/lib/colors'

interface Props {
  songId: string
  tracks: Track[]
  markers: Marker[]
  sections: Section[]
  activeSectionId: string | null
  currentTime: number
  duration: number
  volumes: number[]
  muted: boolean[]
  onSeek: (t: number) => void
  onVolumeChange: (i: number, v: number) => void
  onToggleMute: (i: number) => void
  onSetActiveSection: (id: string | null) => void
  onSectionUpdate?: (id: string, start: number, end: number) => void
  engineState: EngineState
  loadingProgress: number[]
  /** Canal ya decodificado por el engine, uno por pista. Evita que wavesurfer
   *  vuelva a bajar y decodificar el mismo mp3. */
  peaks: Float32Array[]
}

const MARKER_COLOR = 'rgba(255,255,255,0.9)'

function markersForTrack(markers: Marker[], trackIndex: number) {
  return markers.filter(
    (m) => m.trackIndex === trackIndex || (m.trackIndex === undefined && trackIndex === 0)
  )
}

// start === end makes wavesurfer render the region as a marker: a vertical
// line (border-left) instead of a zero-width filled block.
function markerRegionOptions(m: Marker) {
  return {
    id: `m::${m.time}::${m.label}`,
    start: m.time,
    end: m.time,
    content: m.label,
    color: MARKER_COLOR,
    drag: false,
    resize: false,
  }
}

function sectionsForTrack(sections: Section[], trackIndex: number) {
  return sections.filter((r) => (r.trackIndex ?? 0) === trackIndex)
}

export default function MultiTrackWaveform({
  songId,
  tracks,
  markers,
  sections,
  activeSectionId,
  currentTime,
  duration,
  volumes,
  muted,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onSetActiveSection,
  onSectionUpdate,
  engineState,
  loadingProgress,
  peaks,
}: Props) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([])
  const wsInstances = useRef<WaveSurfer[]>([])
  const regionsPluginsRef = useRef<(ReturnType<typeof RegionsPlugin.create> | null)[]>([])
  const wsReadyRef = useRef<boolean[]>([])
  const [wsReadyState, setWsReadyState] = useState<boolean[]>([])
  const interactingRef = useRef(false)
  const markersRef = useRef(markers)
  const activeSectionRef = useRef(activeSectionId)
  const sectionsDataRef = useRef(sections)
  const onSectionUpdateRef = useRef(onSectionUpdate)

  // Espejo de las props para los callbacks de wavesurfer, que se registran una
  // sola vez al crear la instancia y si no leerían valores viejos. Va en un
  // effect y no en el render: escribir refs durante el render es un error.
  useEffect(() => {
    markersRef.current = markers
    activeSectionRef.current = activeSectionId
    sectionsDataRef.current = sections
    onSectionUpdateRef.current = onSectionUpdate
  }, [markers, activeSectionId, sections, onSectionUpdate])

  // Los peaks llegan del engine ya decodificados, así que este effect espera a
  // que estén listos en vez de disparar su propia descarga.
  const peaksReady = peaks.length === tracks.length && duration > 0

  useEffect(() => {
    if (!peaksReady) return

    wsInstances.current.forEach((ws) => ws.destroy())
    wsInstances.current = []
    regionsPluginsRef.current = []
    wsReadyRef.current = []

    tracks.forEach((track, i) => {
      const container = containerRefs.current[i]
      if (!container) return

      const colors = TRACK_COLORS[i % TRACK_COLORS.length]
      const isMain = i === 0

      const regionsPlugin = RegionsPlugin.create()
      regionsPluginsRef.current[i] = regionsPlugin

      const ws = WaveSurfer.create({
        container,
        waveColor: colors.wave,
        progressColor: colors.progress,
        cursorColor: colors.progress,
        height: 'auto',
        normalize: true,
        interact: isMain,
        // Sin `url`: dibuja con los peaks del engine. `duration` es obligatoria
        // cuando no hay media, porque no la puede deducir del archivo.
        peaks: [peaks[i]],
        duration,
        plugins: [regionsPlugin],
      })

      ws.on('ready', () => {
        wsReadyRef.current[i] = true
        setWsReadyState((prev) => {
          const next = [...prev]
          next[i] = true
          return next
        })

        // Markers for this track
        markersForTrack(markersRef.current, i).forEach((m) => {
          regionsPlugin.addRegion(markerRegionOptions(m))
        })

        // Loop sections — only those assigned to this track
        sectionsForTrack(sectionsDataRef.current, i).forEach((r) => {
          const isLocal = r.id.startsWith('local-')
          regionsPlugin.addRegion({
            id: r.id,
            start: r.start,
            end: r.end,
            content: r.label,
            color: r.color ?? 'rgba(74,222,128,0.15)',
            drag: isLocal,
            resize: isLocal,
          })
        })
      })

      if (isMain) {
        ws.on('interaction', (newTime: number) => {
          interactingRef.current = true
          onSeek(newTime)
          wsInstances.current.forEach((other, j) => {
            if (j !== 0 && other.getDuration() > 0) other.setTime(newTime)
          })
          setTimeout(() => { interactingRef.current = false }, 100)
        })
      }

      regionsPlugin.on('region-clicked', (region, e) => {
        e.stopPropagation()
        if (sectionsDataRef.current.some((r) => r.id === region.id)) {
          onSetActiveSection(activeSectionRef.current === region.id ? null : region.id)
          onSeek(region.start)
        }
      })

      regionsPlugin.on('region-updated', (region) => {
        onSectionUpdateRef.current?.(region.id, region.start, region.end)
      })

      wsInstances.current[i] = ws
    })

    return () => {
      wsInstances.current.forEach((ws) => ws.destroy())
      wsInstances.current = []
      wsReadyRef.current = []
      setWsReadyState([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, peaksReady])

  // Sync loop sections per track when sections change
  useEffect(() => {
    tracks.forEach((_, i) => {
      const plugin = regionsPluginsRef.current[i]
      if (!plugin || !wsReadyRef.current[i]) return
      plugin.getRegions().forEach((r) => {
        if (!r.id.startsWith('m::')) r.remove()
      })
      sectionsForTrack(sections, i).forEach((r) => {
        const isLocal = r.id.startsWith('local-')
        plugin.addRegion({
          id: r.id,
          start: r.start,
          end: r.end,
          content: r.label,
          color: r.color ?? 'rgba(74,222,128,0.15)',
          drag: isLocal,
          resize: isLocal,
        })
      })
    })
  }, [sections, tracks])

  // Sync markers to each track's plugin when markers change
  useEffect(() => {
    tracks.forEach((_, i) => {
      const plugin = regionsPluginsRef.current[i]
      if (!plugin || !wsReadyRef.current[i]) return
      plugin.getRegions().forEach((r) => {
        if (r.id.startsWith('m::')) r.remove()
      })
      markersForTrack(markers, i).forEach((m) => {
        plugin.addRegion(markerRegionOptions(m))
      })
    })
  }, [markers, tracks])

  useEffect(() => {
    if (interactingRef.current || duration === 0) return
    wsInstances.current.forEach((ws) => {
      if (ws.getDuration() > 0) ws.setTime(currentTime)
    })
  }, [currentTime, duration])

  useEffect(() => {
    const plugin = regionsPluginsRef.current[0]
    if (!plugin) return
    plugin.getRegions().forEach((r) => {
      const el = r.element as HTMLElement
      el.style.opacity = !activeSectionId || r.id === activeSectionId ? '1' : '0.3'
    })
  }, [activeSectionId])

  return (
    // Con 4 stems las filas se reparten la misma altura: min-h las frena antes de
    // que el slider y el botón de mute queden inservibles, y el contenedor scrollea.
    <div className="flex flex-col gap-1.5 h-full overflow-y-auto">
      {tracks.map((track, i) => {
        const colors = TRACK_COLORS[i % TRACK_COLORS.length]
        const vol = volumes[i] ?? track.defaultVolume
        const isMuted = muted[i] ?? false

        return (
          <div
            key={track.id}
            className="flex items-stretch gap-2 flex-1 min-h-[88px] bg-zinc-800/50 rounded-lg px-2 py-1.5"
          >
            {/* Vertical slider column */}
            {/* w-16 para que entre "Instrumental" (el label más largo) sin cortarse. */}
            <div className="flex flex-col items-center gap-1 w-16 flex-shrink-0 py-0.5">
              <span
                className="text-[10px] font-medium leading-none w-full text-center truncate"
                style={{ color: isMuted ? '#52525b' : colors.progress }}
                title={track.label}
              >
                {track.label}
              </span>
              <div className="flex-1 flex items-center justify-center min-h-0">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={vol}
                  onChange={(e) => onVolumeChange(i, parseFloat(e.target.value))}
                  disabled={isMuted}
                  className="cursor-pointer touch-manipulation disabled:opacity-40"
                  style={{
                    writingMode: 'vertical-lr' as const,
                    direction: 'rtl',
                    width: '20px',
                    height: '100%',
                    accentColor: colors.progress,
                  }}
                  aria-label={`Volumen ${track.label}`}
                />
              </div>
              <button
                onClick={() => onToggleMute(i)}
                className={`h-9 w-9 flex items-center justify-center rounded-lg touch-manipulation transition-colors ${
                  isMuted
                    ? 'bg-zinc-600 text-zinc-300'
                    : 'text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
                aria-label={isMuted ? `Activar ${track.label}` : `Silenciar ${track.label}`}
                title={isMuted ? 'Activar' : 'Silenciar'}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>

            {/* Waveform */}
            <div
              className="flex-1 min-w-0 min-h-0 overflow-hidden rounded relative"
              ref={(el) => { containerRefs.current[i] = el }}
              onClick={i !== 0 ? (e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const t = ((e.clientX - rect.left) / rect.width) * duration
                onSeek(t)
                wsInstances.current.forEach((ws, j) => {
                  if (ws.getDuration() > 0) ws.setTime(t)
                })
              } : undefined}
            >
              <div
                className={`absolute inset-0 pointer-events-none flex flex-col justify-end pb-1 px-1 z-10 transition-opacity duration-500 ${
                  (engineState === 'loading' || engineState === 'idle') || !wsReadyState[i]
                    ? 'opacity-100'
                    : 'opacity-0'
                }`}
              >
                <div className="absolute inset-0 bg-zinc-900/70 rounded" />
                <div className="relative h-1 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width: `${(loadingProgress[i] ?? 0) * 100}%`,
                      backgroundColor: colors.progress,
                      opacity: 0.7,
                      transition: 'width 80ms linear',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
