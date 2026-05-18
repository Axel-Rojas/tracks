'use client'

import { useState } from 'react'
import { X, Pencil } from 'lucide-react'
import type { Marker, Track } from '@/lib/types'
import { TRACK_COLORS } from '@/lib/colors'
import { formatTime } from '@/lib/format'

interface Props {
  isOpen: boolean
  metaMarkers: Marker[]
  localMarkers: Marker[]
  tracks: Track[]
  currentTime: number
  onClose: () => void
  onSeek: (t: number) => void
  onEditLabel: (index: number, label: string) => void
  onDelete: (index: number) => void
}

export default function MarkersPanel({
  isOpen,
  metaMarkers,
  localMarkers,
  tracks,
  onClose,
  onSeek,
  onEditLabel,
  onDelete,
}: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  function startEdit(index: number, label: string) {
    setEditingIndex(index)
    setEditValue(label)
  }

  function commitEdit(index: number) {
    const trimmed = editValue.trim()
    if (trimmed) onEditLabel(index, trimmed)
    setEditingIndex(null)
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-30 w-64 flex flex-col bg-zinc-900 border-l border-zinc-800 transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Marcadores
          </span>
          <button
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 active:bg-zinc-800 touch-manipulation"
            aria-label="Cerrar panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 flex flex-col">
          {metaMarkers.length === 0 && localMarkers.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-600 text-center">
              Sin marcadores
            </p>
          )}

          {/* Meta markers — read-only */}
          {metaMarkers.map((m, i) => (
            <button
              key={`meta-${i}`}
              onClick={() => onSeek(m.time)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 active:bg-zinc-800 touch-manipulation text-left w-full min-h-[52px]"
            >
              <span className="text-xs tabular-nums text-zinc-500 w-14 flex-shrink-0">
                {formatTime(m.time, true)}
              </span>
              <span className="text-sm text-zinc-300 truncate flex-1">{m.label}</span>
            </button>
          ))}

          {/* Divider */}
          {metaMarkers.length > 0 && localMarkers.length > 0 && (
            <div className="mx-4 my-1 border-t border-zinc-800" />
          )}

          {/* Local markers — editable */}
          {localMarkers.map((m, i) => (
            <div
              key={`local-${i}`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/60 min-h-[56px]"
            >
              {/* Time — tap to seek */}
              <button
                onClick={() => onSeek(m.time)}
                className="text-xs tabular-nums text-zinc-500 w-14 flex-shrink-0 text-left touch-manipulation py-2"
              >
                {formatTime(m.time, true)}
              </button>

              {/* Track badge */}
              {m.trackIndex !== undefined && tracks[m.trackIndex] && (
                <span
                  className="text-[9px] font-medium px-1 py-0.5 rounded flex-shrink-0"
                  style={{
                    color: TRACK_COLORS[m.trackIndex % TRACK_COLORS.length].progress,
                    background: TRACK_COLORS[m.trackIndex % TRACK_COLORS.length].wave,
                  }}
                >
                  {tracks[m.trackIndex].label}
                </span>
              )}

              {/* Label — tap to seek, double-tap to edit */}
              {editingIndex === i ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(i)
                    if (e.key === 'Escape') setEditingIndex(null)
                  }}
                  className="flex-1 bg-zinc-700 text-sm text-white rounded-lg px-3 py-2 outline-none min-w-0 h-10"
                />
              ) : (
                <button
                  onClick={() => onSeek(m.time)}
                  onDoubleClick={() => startEdit(i, m.label)}
                  className="flex-1 text-sm text-green-400 truncate text-left touch-manipulation py-2 min-w-0"
                  title="Doble toque para editar"
                >
                  {m.label}
                </button>
              )}

              {/* Edit button */}
              <button
                onClick={() => startEdit(i, m.label)}
                className="h-10 w-10 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 active:bg-zinc-800 flex-shrink-0 touch-manipulation text-base"
                aria-label="Editar"
              >
                <Pencil size={14} />
              </button>

              {/* Delete button */}
              <button
                onClick={() => onDelete(i)}
                className="h-10 w-10 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 active:bg-zinc-800 flex-shrink-0 touch-manipulation text-base"
                aria-label="Eliminar"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
