'use client'

import { useEffect, useRef } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { Marker, Region, Track } from '@/lib/types'
import { rawUrl } from '@/lib/songs'
import { TRACK_COLORS } from '@/lib/colors'

interface Props {
  songId: string
  tracks: Track[]
  markers: Marker[]
  regions: Region[]
  activeRegionId: string | null
  currentTime: number
  duration: number
  volumes: number[]
  muted: boolean[]
  onSeek: (t: number) => void
  onVolumeChange: (i: number, v: number) => void
  onToggleMute: (i: number) => void
  onSetActiveRegion: (id: string | null) => void
  onRegionUpdate?: (id: string, start: number, end: number) => void
}

function markersForTrack(markers: Marker[], trackIndex: number) {
  return markers.filter(
    (m) => m.trackIndex === trackIndex || (m.trackIndex === undefined && trackIndex === 0)
  )
}

function regionsForTrack(regions: Region[], trackIndex: number) {
  return regions.filter((r) => (r.trackIndex ?? 0) === trackIndex)
}

export default function MultiTrackWaveform({
  songId,
  tracks,
  markers,
  regions,
  activeRegionId,
  currentTime,
  duration,
  volumes,
  muted,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onSetActiveRegion,
  onRegionUpdate,
}: Props) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([])
  const wsInstances = useRef<WaveSurfer[]>([])
  const regionsPluginsRef = useRef<(ReturnType<typeof RegionsPlugin.create> | null)[]>([])
  const wsReadyRef = useRef<boolean[]>([])
  const interactingRef = useRef(false)
  const markersRef = useRef(markers)
  markersRef.current = markers
  const activeRegionRef = useRef(activeRegionId)
  activeRegionRef.current = activeRegionId
  const regionsDataRef = useRef(regions)
  regionsDataRef.current = regions
  const onRegionUpdateRef = useRef(onRegionUpdate)
  onRegionUpdateRef.current = onRegionUpdate

  useEffect(() => {
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
        url: rawUrl(`songs/${songId}/${track.file}`),
        plugins: [regionsPlugin],
      })

      ws.setVolume(0)

      ws.on('ready', () => {
        wsReadyRef.current[i] = true

        // Markers for this track
        markersForTrack(markersRef.current, i).forEach((m) => {
          regionsPlugin.addRegion({
            id: `m::${m.time}::${m.label}`,
            start: m.time,
            end: m.time + 0.01,
            content: m.label,
            color: 'rgba(255,255,255,0.07)',
            drag: false,
            resize: false,
          })
        })

        // Loop regions — only those assigned to this track
        regionsForTrack(regionsDataRef.current, i).forEach((r) => {
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
        if (regionsDataRef.current.some((r) => r.id === region.id)) {
          onSetActiveRegion(activeRegionRef.current === region.id ? null : region.id)
          onSeek(region.start)
        }
      })

      regionsPlugin.on('region-updated', (region) => {
        onRegionUpdateRef.current?.(region.id, region.start, region.end)
      })

      wsInstances.current[i] = ws
    })

    return () => {
      wsInstances.current.forEach((ws) => ws.destroy())
      wsInstances.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId])

  // Sync loop regions per track when regions change
  useEffect(() => {
    tracks.forEach((_, i) => {
      const plugin = regionsPluginsRef.current[i]
      if (!plugin || !wsReadyRef.current[i]) return
      plugin.getRegions().forEach((r) => {
        if (!r.id.startsWith('m::')) r.remove()
      })
      regionsForTrack(regions, i).forEach((r) => {
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
  }, [regions, tracks])

  // Sync markers to each track's plugin when markers change
  useEffect(() => {
    tracks.forEach((_, i) => {
      const plugin = regionsPluginsRef.current[i]
      if (!plugin || !wsReadyRef.current[i]) return
      plugin.getRegions().forEach((r) => {
        if (r.id.startsWith('m::')) r.remove()
      })
      markersForTrack(markers, i).forEach((m) => {
        plugin.addRegion({
          id: `m::${m.time}::${m.label}`,
          start: m.time,
          end: m.time + 0.01,
          content: m.label,
          color: 'rgba(255,255,255,0.07)',
          drag: false,
          resize: false,
        })
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
      el.style.opacity = !activeRegionId || r.id === activeRegionId ? '1' : '0.3'
    })
  }, [activeRegionId])

  return (
    <div className="flex flex-col gap-1.5 h-full">
      {tracks.map((track, i) => {
        const colors = TRACK_COLORS[i % TRACK_COLORS.length]
        const vol = volumes[i] ?? track.defaultVolume
        const isMuted = muted[i] ?? false

        return (
          <div
            key={track.id}
            className="flex items-stretch gap-2 flex-1 min-h-0 bg-zinc-800/50 rounded-lg px-2 py-1.5"
          >
            {/* Vertical slider column */}
            <div className="flex flex-col items-center gap-1 w-10 flex-shrink-0 py-0.5">
              <span
                className="text-[10px] font-medium leading-none"
                style={{ color: isMuted ? '#52525b' : colors.progress }}
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
                  className="appearance-none cursor-pointer touch-manipulation rounded-full disabled:opacity-40"
                  style={{
                    writingMode: 'vertical-lr' as const,
                    direction: 'rtl',
                    width: '6px',
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
              className="flex-1 min-w-0 min-h-0 overflow-hidden rounded"
              ref={(el) => { containerRefs.current[i] = el }}
              onClick={i !== 0 ? (e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const t = ((e.clientX - rect.left) / rect.width) * duration
                onSeek(t)
                wsInstances.current.forEach((ws, j) => {
                  if (ws.getDuration() > 0) ws.setTime(t)
                })
              } : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
