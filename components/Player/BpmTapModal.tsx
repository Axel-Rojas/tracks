'use client'

import { useEffect, useRef, useState } from 'react'
import { UI } from '@/lib/constants'

interface Props {
  currentBpm: number | null
  onConfirm: (bpm: number) => void
  onClose: () => void
}

export default function BpmTapModal({ currentBpm, onConfirm, onClose }: Props) {
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null)
  const [tapCount, setTapCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null) // null = not started
  const [done, setDone] = useState(false)
  const [manualInput, setManualInput] = useState('')

  const tapsRef = useRef<number[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopSession() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (endRef.current) clearTimeout(endRef.current)
    setDone(true)
    setTimeLeft(0)
  }

  function handleTap() {
    if (done) return

    const now = Date.now()
    tapsRef.current.push(now)
    const count = tapsRef.current.length
    setTapCount(count)

    // Start countdown on first tap
    if (count === 1) {
      setTimeLeft(UI.BPM_TAP_SESSION_SEC)
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null || prev <= 1) return 0
          return prev - 1
        })
      }, 1000)
      endRef.current = setTimeout(() => stopSession(), UI.BPM_TAP_SESSION_SEC * 1000)
    }

    // Calculate BPM from all intervals
    if (count >= 2) {
      const intervals = tapsRef.current.slice(1).map((t, i) => t - tapsRef.current[i])
      const avg = intervals.reduce((a, b) => a + b) / intervals.length
      const bpm = Math.round(60000 / avg)
      setDetectedBpm(Math.max(UI.BPM_MIN, Math.min(UI.BPM_MAX, bpm)))
    }
  }

  function handleConfirm() {
    if (detectedBpm) {
      onConfirm(detectedBpm)
      onClose()
    }
  }

  // Auto-confirm when session ends with enough taps
  useEffect(() => {
    if (done && detectedBpm && tapCount >= 2) {
      // Small delay so the user sees the final BPM
      const t = setTimeout(() => {
        onConfirm(detectedBpm)
        onClose()
      }, 800)
      return () => clearTimeout(t)
    }
  }, [done, detectedBpm, tapCount, onConfirm, onClose])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (endRef.current) clearTimeout(endRef.current)
    }
  }, [])

  const displayBpm = detectedBpm ?? currentBpm
  const isActive = timeLeft !== null && !done
  const progress = timeLeft !== null ? (timeLeft / UI.BPM_TAP_SESSION_SEC) * 100 : 100
  const parsedManual = (() => {
    const n = parseInt(manualInput, 10)
    return !isNaN(n) && n >= UI.BPM_MIN && n <= UI.BPM_MAX ? n : null
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 flex flex-col items-center gap-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="text-center">
          <h2 className="text-base font-semibold text-white">Detectar BPM</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {!isActive && !done ? 'Tap al ritmo para empezar' : ''}
            {isActive ? `${tapCount} tap${tapCount !== 1 ? 's' : ''} · ${timeLeft}s restantes` : ''}
            {done && tapCount >= 2 ? 'Listo' : ''}
            {done && tapCount < 2 ? 'Pocos taps para calcular' : ''}
          </p>
        </div>

        {/* BPM display */}
        <div className="flex flex-col items-center">
          <span
            className={`text-6xl font-bold tabular-nums transition-colors ${
              detectedBpm ? 'text-green-400' : 'text-zinc-600'
            }`}
          >
            {displayBpm ?? '—'}
          </span>
          <span className="text-xs text-zinc-500 mt-1">bpm</span>
        </div>

        {/* Timer arc / progress bar */}
        {timeLeft !== null && (
          <div className="w-full h-1 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Big tap button */}
        <button
          onPointerDown={handleTap}
          disabled={done}
          className={`w-40 h-40 rounded-full font-bold text-2xl select-none touch-manipulation transition-all active:scale-95 ${
            done
              ? 'bg-zinc-700 text-zinc-500 cursor-default'
              : isActive
              ? 'bg-green-500 hover:bg-green-400 text-black shadow-lg shadow-green-500/30'
              : 'bg-green-500 hover:bg-green-400 text-black shadow-lg shadow-green-500/20'
          }`}
          aria-label="Tap"
        >
          {done ? (detectedBpm ? `${detectedBpm}` : '?') : 'TAP'}
        </button>

        {/* Manual input */}
        <div className="flex gap-2 w-full items-center">
          <input
            type="number"
            min={UI.BPM_MIN}
            max={UI.BPM_MAX}
            placeholder="BPM manual"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && parsedManual) {
                onConfirm(parsedManual)
                onClose()
              }
            }}
            className="flex-1 h-11 px-3 rounded-xl bg-zinc-800 text-white text-sm text-center outline-none border border-zinc-700 focus:border-zinc-500 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="BPM manual"
          />
          <button
            onClick={() => { if (parsedManual) { onConfirm(parsedManual); onClose() } }}
            disabled={!parsedManual}
            className="h-11 px-4 rounded-xl bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-40 text-sm text-white font-medium touch-manipulation transition-colors"
          >
            Usar
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-400 transition-colors"
          >
            Cancelar
          </button>
          {detectedBpm && tapCount >= 2 && (
            <button
              onClick={handleConfirm}
              className="flex-1 h-10 rounded-xl bg-green-500 hover:bg-green-400 text-sm text-black font-semibold transition-colors"
            >
              Usar {detectedBpm} bpm
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
