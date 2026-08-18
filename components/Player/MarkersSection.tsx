'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Eye, EyeOff, Plus } from 'lucide-react'
import type { Marker, Track } from '@/lib/types'
import { TRACK_COLORS } from '@/lib/colors'
import { formatTime } from '@/lib/format'

interface Props {
  isOpen: boolean
  onToggle: () => void
  visible: boolean
  onToggleVisible: () => void
  localMarkers: Marker[]
  tracks: Track[]
  onSeek: (t: number) => void
  onAddMarker: (trackIndex: number) => void
  onEditMarker: (index: number, label: string, trackIndex: number | undefined) => void
  onDelete: (index: number) => void
  addDisabled?: boolean
}

interface EditState {
  index: number
  label: string
  trackIndex: number | undefined
}

function markerColor(m: Marker) {
  if (m.trackIndex !== undefined) {
    return TRACK_COLORS[m.trackIndex % TRACK_COLORS.length].progress
  }
  return '#a1a1aa'
}

export default function MarkersSection({
  isOpen,
  onToggle,
  visible,
  onToggleVisible,
  localMarkers,
  tracks,
  onSeek,
  onAddMarker,
  onEditMarker,
  onDelete,
  addDisabled = false,
}: Props) {
  const [editState, setEditState] = useState<EditState | null>(null)

  const allSorted = localMarkers
    .map((m, i) => ({ ...m, localIndex: i }))
    .sort((a, b) => a.time - b.time)

  function commitEdit() {
    if (!editState) return
    const trimmed = editState.label.trim()
    if (trimmed) onEditMarker(editState.index, trimmed, editState.trackIndex)
    setEditState(null)
  }

  function handleDelete() {
    if (!editState) return
    onDelete(editState.index)
    setEditState(null)
  }

  const totalCount = allSorted.length

  return (
    <>
      <div className="border-t border-zinc-800 flex-shrink-0">
        {/* Toggle bar */}
        <div className="w-full flex items-center gap-1 px-2 py-2.5">
          <button
            onClick={onToggle}
            className="flex items-center gap-2 flex-1 h-9 px-2 rounded-lg text-left hover:bg-zinc-800/50 active:bg-zinc-800 touch-manipulation transition-colors"
            aria-expanded={isOpen}
          >
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest flex-1 text-left">
              Marcadores{totalCount > 0 ? ` (${totalCount})` : ''}
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
            aria-label={visible ? 'Ocultar marcadores' : 'Mostrar marcadores'}
          >
            {visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </div>

        {/* Add marker per track + marker chips */}
        {isOpen && (
          <div className="px-3 pt-2 pb-3 flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              {tracks.map((track, i) => {
                const color = TRACK_COLORS[i % TRACK_COLORS.length].progress
                return (
                  <button
                    key={track.id}
                    onClick={() => onAddMarker(i)}
                    disabled={addDisabled}
                    className="h-8 px-3 rounded-full text-xs font-medium touch-manipulation disabled:opacity-40 transition-opacity border"
                    style={{
                      color,
                      borderColor: `${color}55`,
                      background: `${color}15`,
                    }}
                  >
                    <Plus size={12} className="inline mr-0.5" />{track.label}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2 flex-wrap overflow-y-auto max-h-32">
              {allSorted.length === 0 && (
                <span className="text-xs text-zinc-600 py-1">
                  Usa los botones + para agregar marcadores en la posición actual
                </span>
              )}
              {allSorted.map((m, i) => {
                const color = markerColor(m)
                const trackLabel = m.trackIndex !== undefined ? tracks[m.trackIndex]?.label : undefined
                return (
                  <div key={i} className="flex items-center gap-0.5">
                    {/* Seek button */}
                    <button
                      onClick={() => onSeek(m.time)}
                      className="h-10 px-3 rounded-full text-xs font-medium touch-manipulation flex items-center gap-2 border active:scale-95 transition-transform"
                      style={{
                        color,
                        borderColor: `${color}44`,
                        background: `${color}12`,
                      }}
                    >
                      <span className="opacity-60 tabular-nums">{formatTime(m.time)}</span>
                      <span>{m.label}</span>
                      {trackLabel && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: `${color}30`, color }}
                        >
                          {trackLabel}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setEditState({ index: m.localIndex, label: m.label, trackIndex: m.trackIndex })}
                      className="h-9 w-9 flex items-center justify-center rounded-full text-zinc-600 hover:text-zinc-300 active:bg-zinc-800 touch-manipulation transition-colors text-sm"
                      aria-label="Editar marcador"
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

      {/* Edit modal */}
      {editState !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
          onClick={() => setEditState(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-4 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white">Editar marcador</h2>

            {/* Label input */}
            <input
              autoFocus
              value={editState.label}
              onChange={(e) => setEditState((s) => s && { ...s, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditState(null)
              }}
              className="h-12 px-4 rounded-xl bg-zinc-800 text-white text-sm outline-none border border-zinc-700 focus:border-zinc-500 transition-colors"
              placeholder="Nombre del marcador"
            />

            {/* Track selector */}
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
