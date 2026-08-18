'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import { Menu } from 'lucide-react'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import { usePlayerState } from '@/hooks/usePlayerState'
import { useMetronome } from '@/hooks/useMetronome'
import { useSectionLoop } from '@/hooks/useSectionLoop'
import { useMarkersCrud } from '@/hooks/useMarkersCrud'
import { useSectionsCrud } from '@/hooks/useSectionsCrud'
import MultiTrackWaveform from '@/components/Player/MultiTrackWaveform'
import TransportBar from '@/components/Player/TransportBar'
import SongSidebar from '@/components/Player/SongSidebar'
import BpmTapModal from '@/components/Player/BpmTapModal'
import MarkersSection from '@/components/Player/MarkersSection'
import SectionsPanel from '@/components/Player/SectionsPanel'
import type { SongIndex, SongMeta } from '@/lib/types'
import { PLAYBACK } from '@/lib/constants'
import { saveLastSession } from '@/lib/lastSession'

interface Props {
  meta: SongMeta
  songs: SongIndex[]
}

interface UIState {
  sidebarOpen: boolean
  tapModalOpen: boolean
  markersSectionOpen: boolean
  sectionsPanelOpen: boolean
}

type UIAction =
  | { type: 'toggle'; key: keyof UIState }
  | { type: 'set'; key: keyof UIState; value: boolean }

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'toggle': return { ...state, [action.key]: !state[action.key] }
    case 'set': return { ...state, [action.key]: action.value }
  }
}

const initialUI: UIState = {
  sidebarOpen: false,
  tapModalOpen: false,
  markersSectionOpen: false,
  sectionsPanelOpen: false,
}

export default function PlayerClient({ meta, songs }: Props) {
  const engine = useAudioEngine({ songId: meta.id, tracks: meta.tracks })
  const { persisted, save } = usePlayerState(meta.id)

  const [ui, dispatch] = useReducer(uiReducer, initialUI)

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [markersVisible, setMarkersVisible] = useState(true)
  const [sectionsVisible, setSectionsVisible] = useState(true)
  // El BPM vive solo en `persisted`: save() ya actualiza ese estado al toque
  // (solo debouncea la escritura a localStorage), así que duplicarlo en un
  // useState obligaba a hidratarlo con un setState dentro de un effect.
  const localBpm = persisted.localBpm
  const effectiveBpm = localBpm ?? meta.bpm ?? PLAYBACK.DEFAULT_BPM

  const markers = useMarkersCrud({
    initialMarkers: [],
    getCurrentTime: () => engine.currentTime,
    save,
  })

  const sections = useSectionsCrud({
    initialSections: [],
    save,
  })

  const metronome = useMetronome({
    engineState: engine.state,
    getContext: engine.getContext,
    bpm: effectiveBpm,
    releaseSources: engine.releaseSources,
    play: engine.play,
  })

  useSectionLoop({
    engineState: engine.state,
    currentTime: engine.currentTime,
    activeSectionId,
    allSections: sections.localSections,
    seek: engine.seek,
  })

  useEffect(() => {
    if (engine.state !== 'ready') return
    if (persisted.localMarkers.length > 0) markers.hydrate(persisted.localMarkers)
    if (persisted.localSections.length > 0) sections.hydrate(persisted.localSections)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.state])

  // La sesión se registra cuando el audio suena de verdad: abrir la página y no
  // darle play no cuenta como práctica. Cada play refresca el "hace x tiempo".
  useEffect(() => {
    if (engine.state === 'playing') saveLastSession(meta.id)
  }, [engine.state, meta.id])

  const handleVolumeChange = useCallback(
    (index: number, value: number) => { engine.setVolume(index, value) },
    [engine]
  )

  const handleSetActiveSection = useCallback((id: string | null) => { setActiveSectionId(id) }, [])

  const handleSkip = useCallback(
    (delta: number) => { engine.seek(Math.max(0, Math.min(engine.currentTime + delta, engine.duration))) },
    [engine]
  )

  const handleSkipToMarker = useCallback(
    (dir: -1 | 1) => {
      const sorted = [...markers.localMarkers].sort((a, b) => a.time - b.time)
      if (dir === -1) {
        const prev = [...sorted].reverse().find((m) => m.time < engine.currentTime - PLAYBACK.SEEK_TOLERANCE)
        if (prev) engine.seek(prev.time)
      } else {
        const next = sorted.find((m) => m.time > engine.currentTime + PLAYBACK.SEEK_TOLERANCE)
        if (next) engine.seek(next.time)
      }
    },
    [engine, markers.localMarkers]
  )

  const handleAddSection = useCallback((start: number, end: number) => {
    sections.addSection(start, end)
  }, [sections])

  const handleDeleteSection = useCallback((index: number) => {
    const deletedId = sections.deleteSection(index)
    if (activeSectionId === deletedId) handleSetActiveSection(null)
  }, [sections, activeSectionId, handleSetActiveSection])

  const handleConfirmBpm = useCallback((bpm: number) => {
    save({ localBpm: bpm })
  }, [save])

  return (
    <div className="flex h-dvh bg-zinc-900 overflow-hidden">
      <SongSidebar
        songs={songs}
        currentId={meta.id}
        isOpen={ui.sidebarOpen}
        onClose={() => dispatch({ type: 'set', key: 'sidebarOpen', value: false })}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 flex-shrink-0">
          <button
            onClick={() => dispatch({ type: 'toggle', key: 'sidebarOpen' })}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 touch-manipulation flex-shrink-0"
            aria-label="Canciones"
          >
            <Menu size={18} />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-white truncate leading-tight">{meta.title}</h1>
            <p className="text-xs text-zinc-500 truncate">{meta.artist}</p>
          </div>

          <button
            onClick={() => dispatch({ type: 'set', key: 'tapModalOpen', value: true })}
            className="flex-shrink-0 h-8 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-xs text-zinc-300 touch-manipulation tabular-nums transition-colors"
            title="Detectar BPM tappeando al ritmo"
          >
            {effectiveBpm !== PLAYBACK.DEFAULT_BPM || localBpm ? `${effectiveBpm} bpm` : 'TAP bpm'}
          </button>

        </header>

        {engine.error && (
          <div
            role="alert"
            className="flex-shrink-0 mx-3 mt-2 rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300"
          >
            {engine.error}
          </div>
        )}

        <div className="flex-1 min-h-0 px-3 py-3">
          <MultiTrackWaveform
            songId={meta.id}
            tracks={meta.tracks}
            markers={markersVisible ? markers.localMarkers : []}
            sections={sectionsVisible ? sections.localSections : []}
            activeSectionId={activeSectionId}
            currentTime={engine.currentTime}
            duration={engine.duration}
            volumes={engine.volumes}
            muted={engine.muted}
            onSeek={engine.seek}
            onVolumeChange={handleVolumeChange}
            onToggleMute={engine.toggleMute}
            onSetActiveSection={handleSetActiveSection}
            onSectionUpdate={sections.updateSectionBounds}
            engineState={engine.state}
            loadingProgress={engine.loadingProgress}
            peaks={engine.peaks}
          />
        </div>

        <SectionsPanel
          isOpen={ui.sectionsPanelOpen}
          onToggle={() => dispatch({ type: 'toggle', key: 'sectionsPanelOpen' })}
          visible={sectionsVisible}
          onToggleVisible={() => setSectionsVisible((v) => !v)}
          localSections={sections.localSections}
          tracks={meta.tracks}
          activeSectionId={activeSectionId}
          currentTime={engine.currentTime}
          onSeek={engine.seek}
          onSetActiveSection={handleSetActiveSection}
          onAddSection={handleAddSection}
          onEditSection={sections.editSection}
          onDeleteSection={handleDeleteSection}
        />

        <MarkersSection
          isOpen={ui.markersSectionOpen}
          onToggle={() => dispatch({ type: 'toggle', key: 'markersSectionOpen' })}
          visible={markersVisible}
          onToggleVisible={() => setMarkersVisible((v) => !v)}
          localMarkers={markers.localMarkers}
          tracks={meta.tracks}
          onSeek={engine.seek}
          onAddMarker={markers.addMarker}
          onEditMarker={markers.editMarker}
          onDelete={markers.deleteMarker}
          addDisabled={engine.state === 'idle' || engine.state === 'loading'}
        />

        <div className="flex-shrink-0 px-3 pb-5 pt-2 border-t border-zinc-800">
          <TransportBar
            state={engine.state}
            currentTime={engine.currentTime}
            duration={engine.duration}
            markers={markers.localMarkers}
            sections={sections.localSections}
            activeSectionId={activeSectionId}
            countingIn={metronome.countingIn}
            countInBeat={metronome.countInBeat}
            onPlay={engine.play}
            onPause={engine.pause}
            onSeek={engine.seek}
            onSkip={handleSkip}
            onSkipToMarker={handleSkipToMarker}
            onSetActiveSection={handleSetActiveSection}
            onCountIn={metronome.handleCountIn}
            metronomeOn={metronome.metronomeOn}
            onToggleMetronome={metronome.toggleMetronome}
            metronomeVolume={metronome.metronomeVolume}
            onMetronomeVolumeChange={metronome.setMetronomeVolume}
            globalVolume={engine.globalVolume}
            onGlobalVolumeChange={engine.setGlobalVolume}
            loadingProgress={engine.loadingProgress}
          />
        </div>
      </div>

      {ui.tapModalOpen && (
        <BpmTapModal
          currentBpm={localBpm ?? meta.bpm ?? null}
          onConfirm={handleConfirmBpm}
          onClose={() => dispatch({ type: 'set', key: 'tapModalOpen', value: false })}
        />
      )}
    </div>
  )
}
