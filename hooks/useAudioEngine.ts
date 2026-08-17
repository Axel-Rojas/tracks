'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '@/lib/types'
import { rawUrl } from '@/lib/songs'

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused'

// `navigator.audioSession` existe desde iOS 16.4 pero todavía no está en lib.dom.
declare global {
  interface Navigator {
    audioSession?: {
      type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'
    }
  }
}

async function fetchWithProgress(
  url: string,
  signal: AbortSignal,
  onProgress: (ratio: number) => void
): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal })
  const contentLength = res.headers.get('content-length')

  if (!contentLength || !res.body) {
    onProgress(1)
    return res.arrayBuffer()
  }

  const total = parseInt(contentLength, 10)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(received / total)
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  return buffer.buffer
}

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

  const localVolsRef = useRef<number[]>([])
  const globalVolumeRef = useRef(1)
  const mutedRef = useRef<boolean[]>([])

  const [state, setState] = useState<EngineState>('idle')
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef<EngineState>('idle')
  const [volumes, setVolumes] = useState<number[]>([])
  const [muted, setMuted] = useState<boolean[]>([])
  const [globalVolume, setGlobalVolumeState] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const durationRef = useRef(0)
  // Canal 0 ya decodificado de cada pista. Es una vista sobre el AudioBuffer que
  // el engine tiene igual, así que no cuesta memoria extra: se lo pasamos a
  // wavesurfer para que dibuje sin volver a descargar ni decodificar el mp3.
  const [peaks, setPeaks] = useState<Float32Array[]>([])
  const [loadingProgress, setLoadingProgress] = useState<number[]>([])
  const loadingProgressRawRef = useRef<number[]>([])
  const progressRafRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

  function applyGain(i: number) {
    const gain = gainsRef.current[i]
    if (!gain) return
    gain.gain.value = localVolsRef.current[i] * globalVolumeRef.current * (mutedRef.current[i] ? 0 : 1)
  }

  // `function loop` en vez de referenciar `tick` desde adentro: así el rAF se
  // reagenda solo, sin depender de la identidad del callback. Y la duración se
  // lee de un ref, con lo cual el loop no necesita recrearse nunca.
  const tick = useCallback(function loop() {
    const ctx = ctxRef.current
    if (!ctx || ctx.state !== 'running') return
    const t = offsetRef.current + (ctx.currentTime - startedAtRef.current)
    setCurrentTime(Math.min(t, durationRef.current))
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const stopTick = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  useEffect(() => {
    if (tracks.length === 0) return
    setState('loading')
    setError(null)
    setPeaks([])
    loadingProgressRawRef.current = tracks.map(() => 0)
    setLoadingProgress(tracks.map(() => 0))

    // Sin esto, en iOS el audio sale por la categoría "ambient" y el switch
    // físico de silencio lo muta por completo. 'playback' la ignora.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'
    } catch { /* implementación parcial: seguimos con el default */ }

    const ctx = new AudioContext()
    ctxRef.current = ctx

    const defaultVols = tracks.map((t) => t.defaultVolume)
    localVolsRef.current = defaultVols
    mutedRef.current = tracks.map(() => false)
    setVolumes(defaultVols)
    setMuted(tracks.map(() => false))

    const gains = tracks.map((_, i) => {
      const g = ctx.createGain()
      g.gain.value = defaultVols[i] * globalVolumeRef.current
      g.connect(ctx.destination)
      return g
    })
    gainsRef.current = gains

    let cancelled = false
    const controller = new AbortController()

    Promise.all(
      tracks.map((track, i) =>
        fetchWithProgress(rawUrl(track.file), controller.signal, (ratio) => {
          loadingProgressRawRef.current[i] = ratio
          if (!progressRafRef.current) {
            progressRafRef.current = requestAnimationFrame(() => {
              setLoadingProgress([...loadingProgressRawRef.current])
              progressRafRef.current = 0
            })
          }
        }).then((ab) => ctx.decodeAudioData(ab))
      )
    )
      .then((buffers) => {
        if (cancelled) return
        buffersRef.current = buffers
        const dur = Math.max(...buffers.map((b) => b.duration))
        durationRef.current = dur
        setDuration(dur)
        setPeaks(buffers.map((b) => b.getChannelData(0)))
        stateRef.current = 'ready'
        setState('ready')
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return
        console.error('[audio] fallo al cargar las pistas:', err)
        setError('No se pudieron cargar las pistas. Revisá la conexión y recargá.')
        setState('idle')
      })

    return () => {
      cancelled = true
      controller.abort()
      stopTick()
      if (progressRafRef.current) {
        cancelAnimationFrame(progressRafRef.current)
        progressRafRef.current = 0
      }
      sourcesRef.current.forEach((s) => {
        try { s.stop(); s.disconnect() } catch { /* already stopped */ }
      })
      sourcesRef.current = []
      buffersRef.current = []
      gainsRef.current = []
      ctx.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId])

  const createAndStartSources = useCallback(
    (offset: number) => {
      const ctx = ctxRef.current!
      const gains = gainsRef.current

      // stop() además de disconnect(): un source desconectado pero no detenido
      // sigue corriendo hasta el final del buffer y se acumula en cada seek.
      sourcesRef.current.forEach((s) => {
        try { s.stop() } catch { /* nunca arrancó o ya terminó */ }
        try { s.disconnect() } catch { /* ya desconectado */ }
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
    if (!ctx || ctx.state === 'closed' || buffersRef.current.length === 0) return

    const start = () => {
      setError(null)
      createAndStartSources(offsetRef.current)
      stateRef.current = 'playing'
      setState('playing')
      rafRef.current = requestAnimationFrame(tick)
    }

    // Safari agrega un cuarto estado, 'interrupted' (llamada, Siri, pantalla
    // bloqueada), que no está en el tipo de TS. Todo lo que no sea 'running'
    // necesita resume(): arrancar sources sobre un ctx interrumpido no suena.
    if (ctx.state !== 'running') {
      ctx.resume().then(start).catch(() => {
        setError('El audio quedó interrumpido. Tocá play de nuevo.')
      })
      return
    }

    start()
  }, [createAndStartSources, tick])

  const pause = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    offsetRef.current = offsetRef.current + (ctx.currentTime - startedAtRef.current)
    ctx.suspend()
    stopTick()
    stateRef.current = 'paused'
    setState('paused')
  }, [])

  const seek = useCallback(
    (time: number) => {
      const ctx = ctxRef.current
      if (!ctx) return

      offsetRef.current = time
      setCurrentTime(time)

      if (stateRef.current === 'playing') {
        createAndStartSources(time)
      }
    },
    [createAndStartSources]
  )

  const setVolume = useCallback((trackIndex: number, value: number) => {
    localVolsRef.current[trackIndex] = value
    applyGain(trackIndex)
    setVolumes((prev) => {
      const next = [...prev]
      next[trackIndex] = value
      return next
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = useCallback((trackIndex: number) => {
    mutedRef.current[trackIndex] = !mutedRef.current[trackIndex]
    applyGain(trackIndex)
    setMuted((prev) => {
      const next = [...prev]
      next[trackIndex] = !prev[trackIndex]
      return next
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setGlobalVolume = useCallback((value: number) => {
    globalVolumeRef.current = value
    setGlobalVolumeState(value)
    gainsRef.current.forEach((_, i) => applyGain(i))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getContext = useCallback(() => ctxRef.current, [])

  const releaseSources = useCallback(() => {
    sourcesRef.current.forEach((s) => {
      try { s.stop(); s.disconnect() } catch { /* already stopped */ }
    })
    sourcesRef.current = []
  }, [])

  return {
    state,
    error,
    peaks,
    loadingProgress,
    currentTime,
    duration,
    volumes,
    muted,
    globalVolume,
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
    setGlobalVolume,
    getContext,
    releaseSources,
  }
}
