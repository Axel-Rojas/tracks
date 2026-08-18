'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Flag, Check, X, Repeat, Eye, EyeOff } from 'lucide-react'
import type { Section, Track } from '@/lib/types'
import { TRACK_COLORS, SECTION_PRESETS, DEFAULT_SECTION_COLOR, solidFromRgba } from '@/lib/colors'
import { formatTime } from '@/lib/format'
import { PLAYBACK } from '@/lib/constants'

interface Props {
  isOpen: boolean
  onToggle: () => void
  visible: boolean
  onToggleVisible: () => void
  localSections: Section[]
  tracks: Track[]
  activeSectionId: string | null
  currentTime: number
  onSeek: (t: number) => void
  onSetActiveSection: (id: string | null) => void
  onAddSection: (start: number, end: number) => void
  onEditSection: (index: number, patch: Partial<Section>) => void
  onDeleteSection: (index: number) => void
}

interface EditState {
  index: number
  label: string
  start: number
  end: number
  color: string
  trackIndex: number
}

/** Décimas: más precisión que eso no se puede marcar a mano ni se lee. */
function stamp(t: number): number {
  return Math.round(t * 10) / 10
}

function TimeInput({
  label,
  value,
  onMarkHere,
  onChange,
}: {
  label: string
  value: number
  onMarkHere: () => void
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          step={1}
          value={Math.round(value)}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-16 h-10 px-2 rounded-xl bg-zinc-800 text-white text-sm text-center outline-none border border-zinc-700 focus:border-zinc-500 transition-colors"
        />
        <span className="text-xs text-zinc-500 tabular-nums w-10">{formatTime(value)}</span>
        <button
          onClick={onMarkHere}
          className="h-10 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 touch-manipulation transition-colors"
          title="Marcar en la posición actual"
        >
          <Flag size={12} className="inline mr-1" />marcar acá
        </button>
      </div>
    </div>
  )
}

export default function SectionsPanel({
  isOpen,
  onToggle,
  visible,
  onToggleVisible,
  localSections,
  tracks,
  activeSectionId,
  currentTime,
  onSeek,
  onSetActiveSection,
  onAddSection,
  onEditSection,
  onDeleteSection,
}: Props) {
  const [editState, setEditState] = useState<EditState | null>(null)
  // Inicio ya marcado, esperando el fin. null = todavía no empezó a marcar.
  const [pendingStart, setPendingStart] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const allSections = localSections.map((s, i) => ({ ...s, localIndex: i }))

  function markStart() {
    setHint(null)
    setPendingStart(stamp(currentTime))
  }

  function markEnd() {
    if (pendingStart === null) return
    const t = stamp(currentTime)
    // Marcar el fin antes del inicio es una corrección, no un error: se ordena.
    const start = Math.min(pendingStart, t)
    const end = Math.max(pendingStart, t)
    if (end - start < PLAYBACK.MIN_SECTION_DURATION) {
      setHint('La sección quedó demasiado corta. Dejá correr el audio y marcá el fin de nuevo.')
      return
    }
    onAddSection(start, end)
    setPendingStart(null)
    setHint(null)
  }

  function cancelMarking() {
    setPendingStart(null)
    setHint(null)
  }

  function commitEdit() {
    if (!editState) return
    const { index, label, start, end, color, trackIndex } = editState
    if (label.trim()) {
      onEditSection(index, {
        label: label.trim(),
        start: Math.min(start, end),
        end: Math.max(start, end),
        color,
        trackIndex,
      })
    }
    setEditState(null)
  }

  function handleDelete() {
    if (!editState) return
    onDeleteSection(editState.index)
    setEditState(null)
  }

  return (
    <>
      <div className="border-t border-zinc-800 flex-shrink-0">
        <div className="w-full flex items-center gap-1 px-2 py-2.5">
          <button
            onClick={onToggle}
            className="flex items-center gap-2 flex-1 h-9 px-2 rounded-lg text-left hover:bg-zinc-800/50 active:bg-zinc-800 touch-manipulation transition-colors"
            aria-expanded={isOpen}
          >
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest flex-1 text-left">
              Secciones{allSections.length > 0 ? ` (${allSections.length})` : ''}
            </span>
            <span className="text-zinc-600">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
          </button>
          <button
            onClick={onToggleVisible}
            className={`h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg touch-manipulation transition-colors ${
              visible
                ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            aria-label={visible ? 'Ocultar secciones' : 'Mostrar secciones'}
          >
            {visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </div>

        {isOpen && (
          <div className="px-3 pt-2 pb-3 flex flex-col gap-2">
            {/* Marcar inicio y después fin: la sección se crea al marcar el fin. */}
            {pendingStart === null ? (
              <button
                onClick={markStart}
                className="self-start h-9 px-3.5 rounded-full text-xs font-medium text-green-400 border border-green-400/30 bg-green-400/10 hover:bg-green-400/20 touch-manipulation transition-colors flex items-center gap-1.5"
              >
                <Flag size={13} />
                Marcar inicio
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={markEnd}
                  className="h-9 px-3.5 rounded-full text-xs font-semibold text-black bg-green-500 hover:bg-green-400 active:bg-green-600 touch-manipulation transition-colors flex items-center gap-1.5"
                >
                  <Check size={13} />
                  Marcar fin
                </button>
                <span className="text-xs text-zinc-500 tabular-nums">
                  desde {formatTime(pendingStart)}
                </span>
                <button
                  onClick={cancelMarking}
                  className="h-9 w-9 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 active:bg-zinc-800 touch-manipulation transition-colors"
                  aria-label="Cancelar"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {hint && <p className="text-xs text-amber-400">{hint}</p>}

            <div className="flex gap-2 flex-wrap">
              {allSections.length === 0 && !hint && (
                <span className="text-xs text-zinc-600 py-1">
                  Marcá el inicio y el fin para crear una sección y hacerle loop.
                </span>
              )}
              {allSections.map((s) => {
                const solid = solidFromRgba(s.color ?? DEFAULT_SECTION_COLOR)
                const isActive = s.id === activeSectionId
                return (
                  <div key={s.id} className="flex items-center gap-0.5">
                    <button
                      onClick={() => {
                        onSetActiveSection(isActive ? null : s.id)
                        onSeek(s.start)
                      }}
                      className="h-10 px-3 rounded-full text-xs font-medium touch-manipulation flex items-center gap-1.5 border active:scale-95 transition-all"
                      style={{
                        color: solid,
                        borderColor: isActive ? solid : `${solid}44`,
                        background: isActive ? `${solid}25` : `${solid}12`,
                        boxShadow: isActive ? `0 0 0 1px ${solid}40` : 'none',
                      }}
                    >
                      <span className="opacity-60 text-[10px] tabular-nums">{formatTime(s.start)}–{formatTime(s.end)}</span>
                      <span>{s.label}</span>
                      <Repeat size={10} className="opacity-50" />
                    </button>

                    <button
                      onClick={() =>
                        setEditState({
                          index: s.localIndex,
                          label: s.label,
                          start: s.start,
                          end: s.end,
                          color: s.color ?? DEFAULT_SECTION_COLOR,
                          trackIndex: s.trackIndex ?? 0,
                        })
                      }
                      className="h-9 w-9 flex items-center justify-center rounded-full text-zinc-600 hover:text-zinc-300 active:bg-zinc-800 touch-manipulation transition-colors text-sm"
                      aria-label={`Editar ${s.label}`}
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {editState !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
          onClick={() => setEditState(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-4 w-[340px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white">Editar sección</h2>

            {/* Nombre */}
            <input
              autoFocus
              value={editState.label}
              onChange={(e) => setEditState((s) => s && { ...s, label: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditState(null) }}
              className="h-12 px-4 rounded-xl bg-zinc-800 text-white text-sm outline-none border border-zinc-700 focus:border-zinc-500 transition-colors"
              placeholder="Estrofa, Estribillo, Puente..."
            />

            {/* Duración: se puede re-marcar inicio y fin con el audio corriendo. */}
            <div className="flex flex-col gap-3">
              <TimeInput
                label="Inicio"
                value={editState.start}
                onChange={(v) => setEditState((s) => s && { ...s, start: v })}
                onMarkHere={() => setEditState((s) => s && { ...s, start: stamp(currentTime) })}
              />
              <TimeInput
                label="Fin"
                value={editState.end}
                onChange={(v) => setEditState((s) => s && { ...s, end: v })}
                onMarkHere={() => setEditState((s) => s && { ...s, end: stamp(currentTime) })}
              />
              <span className="text-xs text-zinc-600 tabular-nums">
                Dura {formatTime(Math.abs(editState.end - editState.start))}
              </span>
            </div>

            {/* Pista */}
            {tracks.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-zinc-500">Pista</span>
                <div className="flex gap-2 flex-wrap">
                  {tracks.map((track, i) => {
                    const color = TRACK_COLORS[i % TRACK_COLORS.length].progress
                    const selected = editState.trackIndex === i
                    return (
                      <button
                        key={track.id}
                        onClick={() => setEditState((s) => s && { ...s, trackIndex: i })}
                        className="h-9 px-4 rounded-full text-xs font-medium touch-manipulation border transition-all"
                        style={{
                          color,
                          borderColor: selected ? color : `${color}44`,
                          background: selected ? `${color}30` : `${color}10`,
                        }}
                      >
                        {track.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Color */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-zinc-500">Color</span>
              <div className="flex gap-2.5">
                {SECTION_PRESETS.map((p) => (
                  <button
                    key={p.rgba}
                    onClick={() => setEditState((s) => s && { ...s, color: p.rgba })}
                    className="w-7 h-7 rounded-full transition-transform hover:scale-110 touch-manipulation"
                    style={{
                      background: p.solid,
                      outline: editState.color === p.rgba ? `2px solid ${p.solid}` : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                    aria-label={`Color ${p.solid}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                className="flex-1 h-11 rounded-xl bg-zinc-800 hover:bg-red-950 active:bg-red-900 text-sm text-red-400 font-medium touch-manipulation transition-colors"
              >
                Eliminar
              </button>
              <button
                onClick={commitEdit}
                className="flex-1 h-11 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 text-sm text-black font-semibold touch-manipulation transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
