'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AUDIO, PLAYBACK } from '@/lib/constants'
import type { EngineState } from '@/hooks/useAudioEngine'

interface MetronomeOptions {
  engineState: EngineState
  getContext: () => AudioContext | null
  bpm: number
  releaseSources: () => void
  play: () => void
}

function playCountIn(
  ctx: AudioContext,
  bpm: number,
  onBeat: (beat: number) => void,
  onDone: () => void
) {
  const beatDuration = 60 / bpm
  for (let i = 0; i < PLAYBACK.COUNT_IN_BEATS; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    const t = ctx.currentTime + i * beatDuration
    osc.frequency.value = i === 0 ? AUDIO.COUNT_IN_FREQ_ACCENT : AUDIO.COUNT_IN_FREQ_NORMAL
    gain.gain.setValueAtTime(AUDIO.COUNT_IN_GAIN, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + AUDIO.COUNT_IN_DECAY)
    osc.start(t)
    osc.stop(t + AUDIO.COUNT_IN_DECAY)
    setTimeout(() => onBeat(PLAYBACK.COUNT_IN_BEATS - i), i * beatDuration * 1000)
  }
  setTimeout(onDone, PLAYBACK.COUNT_IN_BEATS * beatDuration * 1000)
}

export function useMetronome({ engineState, getContext, bpm, releaseSources, play }: MetronomeOptions) {
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [metronomeVolume, setMetronomeVolume] = useState(0.7)
  const [countingIn, setCountingIn] = useState(false)
  const [countInBeat, setCountInBeat] = useState<number>(PLAYBACK.COUNT_IN_BEATS)

  const metronomeRef = useRef<{ nextBeatTime: number; timerId: ReturnType<typeof setTimeout> | null }>({
    nextBeatTime: 0,
    timerId: null,
  })
  const lastBpmRef = useRef(bpm)

  useEffect(() => {
    const ctx = getContext()
    if (!metronomeOn || engineState !== 'playing' || !ctx) {
      if (metronomeRef.current.timerId) {
        clearTimeout(metronomeRef.current.timerId)
        metronomeRef.current.timerId = null
      }
      return
    }

    const beatDuration = 60 / bpm

    if (bpm !== lastBpmRef.current) {
      lastBpmRef.current = bpm
      metronomeRef.current.nextBeatTime = ctx.currentTime
    }

    function scheduleTick() {
      const now = ctx!.currentTime
      while (metronomeRef.current.nextBeatTime < now + AUDIO.METRONOME_SCHEDULE_AHEAD) {
        const t = metronomeRef.current.nextBeatTime
        if (t >= now) {
          const osc = ctx!.createOscillator()
          const gain = ctx!.createGain()
          osc.connect(gain)
          gain.connect(ctx!.destination)
          osc.frequency.value = AUDIO.METRONOME_FREQ
          gain.gain.setValueAtTime(metronomeVolume, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + AUDIO.METRONOME_DECAY)
          osc.start(t)
          osc.stop(t + AUDIO.METRONOME_DECAY)
        }
        metronomeRef.current.nextBeatTime += beatDuration
      }
      metronomeRef.current.timerId = setTimeout(scheduleTick, AUDIO.METRONOME_LOOKAHEAD_MS)
    }

    metronomeRef.current.nextBeatTime = ctx.currentTime
    scheduleTick()

    return () => {
      if (metronomeRef.current.timerId) {
        clearTimeout(metronomeRef.current.timerId)
        metronomeRef.current.timerId = null
      }
    }
  }, [metronomeOn, engineState, bpm, metronomeVolume, getContext])

  const handleCountIn = useCallback(() => {
    const ctx = getContext()
    if (!ctx || countingIn) return

    releaseSources()
    setCountingIn(true)
    setCountInBeat(PLAYBACK.COUNT_IN_BEATS)

    const doCountIn = () => {
      playCountIn(
        ctx,
        bpm,
        (beat) => setCountInBeat(beat),
        () => {
          setCountingIn(false)
          play()
        }
      )
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(doCountIn)
    } else {
      doCountIn()
    }
  }, [getContext, bpm, countingIn, releaseSources, play])

  return {
    metronomeOn,
    setMetronomeOn,
    metronomeVolume,
    setMetronomeVolume,
    countingIn,
    countInBeat,
    handleCountIn,
    toggleMetronome: useCallback(() => setMetronomeOn((v) => !v), []),
  }
}
