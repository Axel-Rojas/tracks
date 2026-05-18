'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, ArrowLeft, Repeat, Eye, EyeOff } from 'lucide-react'
import type { Region, Track } from '@/lib/types'
import { TRACK_COLORS, REGION_PRESETS, DEFAULT_REGION_COLOR, solidFromRgba } from '@/lib/colors'
import { formatTime } from '@/lib/format'

interface Props {
  isOpen: boolean
  onToggle: () => void
  visible: boolean
  onToggleVisible: () => void
  metaRegions: Region[]
  localRegions: Region[]
  tracks: Track[]
  activeRegionId: string | null
  currentTime: number
  onSeek: (t: number) => void
  onSetActiveRegion: (id: string | null) => void
  onAddRegion: () => void
  onEditRegion: (index: number, patch: Partial<Region>) => void
  onDeleteRegion: (index: number) => void
}

interface EditState {
  index: number
  label: string
  start: number
  end: number
  color: string
  trackIndex: number
}

function TimeInput({
  label,
  value,
  onCurrentTime,
  onChange,
}: {
  label: string
  value: number
  onCurrentTime: () => void
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
          onClick={onCurrentTime}
          className="h-10 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 touch-manipulation transition-colors"
          title="Usar posición actual"
        >
          <ArrowLeft size={12} className="inline" /> actual
        </button>
      </div>
    </div>
  )
}

export default function RegionsSection({
  isOpen,
  onToggle,
  visible,
  onToggleVisible,
  metaRegions,
  localRegions,
  tracks,
  activeRegionId,
  currentTime,
  onSeek,
  onSetActiveRegion,
  onAddRegion,
  onEditRegion,
  onDeleteRegion,
}: Props) {
  const [editState, setEditState] = useState<EditState | null>(null)

  const allRegions = [
    ...metaRegions.map((r) => ({ ...r, isLocal: false as const, localIndex: -1 })),
    ...localRegions.map((r, i) => ({ ...r, isLocal: true as const, localIndex: i })),
  ]

  function commitEdit() {
    if (!editState) return
    const { index, label, start, end, color, trackIndex } = editState
    if (label.trim()) {
      onEditRegion(index, { label: label.trim(), start, end, color, trackIndex })
    }
    setEditState(null)
  }

  function handleDelete() {
    if (!editState) return
    onDeleteRegion(editState.index)
    setEditState(null)
  }

  return (
    <>
      <div className="border-t border-zinc-800 flex-shrink-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/50 active:bg-zinc-800 touch-manipulation transition-colors"
          aria-expanded={isOpen}
        >
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest flex-1 text-left">
            Regiones{allRegions.length > 0 ? ` (${allRegions.length})` : ''}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVisible() }}
            className="h-9 w-9 flex items-center justify-center text-zinc-600 hover:text-zinc-300 touch-manipulation transition-colors"
            aria-label={visible ? 'Ocultar regiones' : 'Mostrar regiones'}
          >
            {visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <span className="text-zinc-600">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        </button>

        {isOpen && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            <button
              onClick={onAddRegion}
              className="self-start h-8 px-3 rounded-full text-xs font-medium text-green-400 border border-green-400/30 bg-green-400/10 hover:bg-green-400/20 touch-manipulation transition-colors"
            >
              + Agregar región
            </button>

            <div className="flex gap-2 flex-wrap">
              {allRegions.length === 0 && (
                <span className="text-xs text-zinc-600 py-1">
                  Agrega regiones para hacer loop de secciones
                </span>
              )}
              {allRegions.map((r) => {
                const solid = solidFromRgba(r.color ?? DEFAULT_REGION_COLOR)
                const isActive = r.id === activeRegionId
                return (
                  <div key={r.id} className="flex items-center gap-0.5">
                    <button
                      onClick={() => {
                        onSetActiveRegion(isActive ? null : r.id)
                        onSeek(r.start)
                      }}
                      className="h-10 px-3 rounded-full text-xs font-medium touch-manipulation flex items-center gap-1.5 border active:scale-95 transition-all"
                      style={{
                        color: solid,
                        borderColor: isActive ? solid : `${solid}44`,
                        background: isActive ? `${solid}25` : `${solid}12`,
                        boxShadow: isActive ? `0 0 0 1px ${solid}40` : 'none',
                      }}
                    >
                      <span className="opacity-60 text-[10px] tabular-nums">{formatTime(r.start)}–{formatTime(r.end)}</span>
                      <span>{r.label}</span>
                      <Repeat size={10} className="opacity-50" />
                    </button>

                    {r.isLocal && (
                      <button
                        onClick={() =>
                          setEditState({
                            index: r.localIndex,
                            label: r.label,
                            start: r.start,
                            end: r.end,
                            color: r.color ?? DEFAULT_REGION_COLOR,
                            trackIndex: r.trackIndex ?? 0,
                          })
                        }
                        className="h-9 w-9 flex items-center justify-center rounded-full text-zinc-600 hover:text-zinc-300 active:bg-zinc-800 touch-manipulation transition-colors text-sm"
                        aria-label="Editar región"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
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
            <h2 className="text-sm font-semibold text-white">Editar región</h2>

            {/* Label */}
            <input
              autoFocus
              value={editState.label}
              onChange={(e) => setEditState((s) => s && { ...s, label: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditState(null) }}
              className="h-12 px-4 rounded-xl bg-zinc-800 text-white text-sm outline-none border border-zinc-700 focus:border-zinc-500 transition-colors"
              placeholder="Coro, Intro, Puente..."
            />

            {/* Start / End */}
            <div className="flex flex-col gap-3">
              <TimeInput
                label="Inicio"
                value={editState.start}
                onChange={(v) => setEditState((s) => s && { ...s, start: v })}
                onCurrentTime={() => setEditState((s) => s && { ...s, start: Math.round(currentTime * 10) / 10 })}
              />
              <TimeInput
                label="Fin"
                value={editState.end}
                onChange={(v) => setEditState((s) => s && { ...s, end: v })}
                onCurrentTime={() => setEditState((s) => s && { ...s, end: Math.round(currentTime * 10) / 10 })}
              />
            </div>

            {/* Track selector */}
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

            {/* Color swatches */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-zinc-500">Color</span>
              <div className="flex gap-2.5">
                {REGION_PRESETS.map((p) => (
                  <button
                    key={p.rgba}
                    onClick={() => setEditState((s) => s && { ...s, color: p.rgba })}
                    className="w-7 h-7 rounded-full transition-transform hover:scale-110 touch-manipulation"
                    style={{
                      background: p.solid,
                      outline: editState.color === p.rgba ? `2px solid ${p.solid}` : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
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
