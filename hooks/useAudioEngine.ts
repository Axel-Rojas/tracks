'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '@/lib/types'
import { rawUrl } from '@/lib/songs'

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused'

interface AudioEngineOptions {
  songId: string
  tracks: Track[]
}

export function useAudioEngine({ songId, tracks }: AudioEngineOptions) {
  const ctxRef = useRef<AudioContext | null>(null)
  const buffersRef = useRef<AudioBuffer[]>([])
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const gainsRef = useRef<GainNode[]>([])
  const offsetRef = useRef(0)
  const startedAtRef = useRef(0)

  const [state, setState] = useState<EngineState>('idle')
  const [volumes, setVolumes] = useState<number[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef<number>(0)

  // Tick para actualizar currentTime
  const tick = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || ctx.state !== 'running') return
    const t = offsetRef.current + (ctx.currentTime - startedAtRef.current)
    setCurrentTime(Math.min(t, duration))
    rafRef.current = requestAnimationFrame(tick)
  }, [duration])

  const stopTick = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  // Cargar todas las pistas
  useEffect(() => {
    if (tracks.length === 0) return
    setState('loading')

    const ctx = new AudioContext()
    ctxRef.current = ctx

    const defaultVols = tracks.map((t) => t.defaultVolume)
    setVolumes(defaultVols)

    const gains = tracks.map((_, i) => {
      const g = ctx.createGain()
      g.gain.value = defaultVols[i]
      g.connect(ctx.destination)
      return g
    })
    gainsRef.current = gains

    Promise.all(
      tracks.map((track) =>
        fetch(rawUrl(`songs/${songId}/${track.file}`))
          .then((r) => r.arrayBuffer())
          .then((ab) => ctx.decodeAudioData(ab))
      )
    )
      .then((buffers) => {
        buffersRef.current = buffers
        setDuration(Math.max(...buffers.map((b) => b.duration)))
        setState('ready')
      })
      .catch(() => setState('idle'))

    return () => {
      stopTick()
      ctx.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId])

  const createAndStartSources = useCallback(
    (offset: number) => {
      const ctx = ctxRef.current!
      const gains = gainsRef.current

      // Limpiar sources anteriores
      sourcesRef.current.forEach((s) => {
        try { s.disconnect() } catch { /* already stopped */ }
      })

      const newSources = buffersRef.current.map((buf, i) => {
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(gains[i])
        return src
      })

      const when = ctx.currentTime
      newSources.forEach((src) => src.start(when, offset))

      sourcesRef.current = newSources
      startedAtRef.current = when
      offsetRef.current = offset
    },
    []
  )

  const play = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || buffersRef.current.length === 0) return

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        createAndStartSources(offsetRef.current)
        setState('playing')
        rafRef.current = requestAnimationFrame(tick)
      })
      return
    }

    createAndStartSources(offsetRef.current)
    setState('playing')
    rafRef.current = requestAnimationFrame(tick)
  }, [createAndStartSources, tick])

  const pause = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    offsetRef.current = offsetRef.current + (ctx.currentTime - startedAtRef.current)
    ctx.suspend()
    stopTick()
    setState('paused')
  }, [])

  const seek = useCallback(
    (time: number) => {
      const ctx = ctxRef.current
      if (!ctx) return

      const wasPlaying = ctx.state === 'running'
      offsetRef.current = time
      setCurrentTime(time)

      if (wasPlaying) {
        createAndStartSources(time)
      }
    },
    [createAndStartSources]
  )

  const setVolume = useCallback((trackIndex: number, value: number) => {
    const gain = gainsRef.current[trackIndex]
    if (gain) gain.gain.value = value
    setVolumes((prev) => {
      const next = [...prev]
      next[trackIndex] = value
      return next
    })
  }, [])

  const getContext = useCallback(() => ctxRef.current, [])

  const releaseSources = useCallback(() => {
    sourcesRef.current.forEach((s) => {
      try { s.stop(); s.disconnect() } catch { /* already stopped */ }
    })
    sourcesRef.current = []
  }, [])

  return {
    state,
    currentTime,
    duration,
    volumes,
    play,
    pause,
    seek,
    setVolume,
    getContext,
    releaseSources,
  }
}
