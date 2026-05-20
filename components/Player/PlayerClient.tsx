'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import { Menu } from 'lucide-react'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import { usePlayerState } from '@/hooks/usePlayerState'
import { useMetronome } from '@/hooks/useMetronome'
import { useRegionLoop } from '@/hooks/useRegionLoop'
import { useMarkersCrud } from '@/hooks/useMarkersCrud'
import { useRegionsCrud } from '@/hooks/useRegionsCrud'
import MultiTrackWaveform from '@/components/Player/MultiTrackWaveform'
import TransportBar from '@/components/Player/TransportBar'
import SongSidebar from '@/components/Player/SongSidebar'
import ChordsPanel from '@/components/Player/ChordsPanel'
import BpmTapModal from '@/components/Player/BpmTapModal'
import MarkersSection from '@/components/Player/MarkersSection'
import RegionsSection from '@/components/Player/RegionsSection'
import type { SongIndex, SongMeta } from '@/lib/types'
import { PLAYBACK } from '@/lib/constants'

interface Props {
  meta: SongMeta
  songs: SongIndex[]
}

interface UIState {
  chordsOpen: boolean
  sidebarOpen: boolean
  tapModalOpen: boolean
  markersSectionOpen: boolean
  regionsSectionOpen: boolean
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
  chordsOpen: false,
  sidebarOpen: false,
  tapModalOpen: false,
  markersSectionOpen: false,
  regionsSectionOpen: false,
}

export default function PlayerClient({ meta, songs }: Props) {
  const engine = useAudioEngine({ songId: meta.id, tracks: meta.tracks })
  const { persisted, save } = usePlayerState(meta.id)

  const [ui, dispatch] = useReducer(uiReducer, initialUI)

  const [activeRegionId, setActiveRegionId] = useState<string | null>(null)
  const [markersVisible, setMarkersVisible] = useState(true)
  const [regionsVisible, setRegionsVisible] = useState(true)
  const [localBpm, setLocalBpm] = useState<number | null>(null)
  const effectiveBpm = localBpm ?? meta.bpm ?? PLAYBACK.DEFAULT_BPM

  const markers = useMarkersCrud({
    initialMarkers: [],
    getCurrentTime: () => engine.currentTime,
    save,
  })

  const regions = useRegionsCrud({
    initialRegions: [],
    getCurrentTime: () => engine.currentTime,
    getDuration: () => engine.duration,
    save,
  })

  const metronome = useMetronome({
    engineState: engine.state,
    getContext: engine.getContext,
    bpm: effectiveBpm,
    releaseSources: engine.releaseSources,
    play: engine.play,
  })

  useRegionLoop({
    engineState: engine.state,
    currentTime: engine.currentTime,
    activeRegionId,
    allRegions: regions.localRegions,
    seek: engine.seek,
  })

  useEffect(() => {
    if (engine.state !== 'ready') return
    if (persisted.localMarkers.length > 0) markers.hydrate(persisted.localMarkers)
    if (persisted.localRegions.length > 0) regions.hydrate(persisted.localRegions)
    if (persisted.localBpm) setLocalBpm(persisted.localBpm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.state])

  const handleVolumeChange = useCallback(
    (index: number, value: number) => { engine.setVolume(index, value) },
    [engine]
  )

  const handleSetActiveRegion = useCallback((id: string | null) => { setActiveRegionId(id) }, [])

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

  const handleAddRegion = useCallback(() => {
    regions.addRegion()
    dispatch({ type: 'set', key: 'regionsSectionOpen', value: true })
  }, [regions])

  const handleDeleteRegion = useCallback((index: number) => {
    const deletedId = regions.deleteRegion(index)
    if (activeRegionId === deletedId) handleSetActiveRegion(null)
  }, [regions, activeRegionId, handleSetActiveRegion])

  const handleConfirmBpm = useCallback((bpm: number) => {
    setLocalBpm(bpm)
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

          {meta.chordsFile && (
            <button
              onClick={() => dispatch({ type: 'set', key: 'chordsOpen', value: true })}
              className="flex-shrink-0 h-8 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 touch-manipulation"
            >
              Acordes
            </button>
          )}
        </header>

        <div className="flex-1 min-h-0 px-3 py-3">
          <MultiTrackWaveform
            songId={meta.id}
            tracks={meta.tracks}
            markers={markersVisible ? markers.localMarkers : []}
            regions={regionsVisible ? regions.localRegions : []}
            activeRegionId={activeRegionId}
            currentTime={engine.currentTime}
            duration={engine.duration}
            volumes={engine.volumes}
            muted={engine.muted}
            onSeek={engine.seek}
            onVolumeChange={handleVolumeChange}
            onToggleMute={engine.toggleMute}
            onSetActiveRegion={handleSetActiveRegion}
            onRegionUpdate={regions.updateRegionBounds}
            engineState={engine.state}
            loadingProgress={engine.loadingProgress}
          />
        </div>

        <RegionsSection
          isOpen={ui.regionsSectionOpen}
          onToggle={() => dispatch({ type: 'toggle', key: 'regionsSectionOpen' })}
          visible={regionsVisible}
          onToggleVisible={() => setRegionsVisible((v) => !v)}
          localRegions={regions.localRegions}
          tracks={meta.tracks}
          activeRegionId={activeRegionId}
          currentTime={engine.currentTime}
          onSeek={engine.seek}
          onSetActiveRegion={handleSetActiveRegion}
          onAddRegion={handleAddRegion}
          onEditRegion={regions.editRegion}
          onDeleteRegion={handleDeleteRegion}
        />

        <MarkersSection
          isOpen={ui.markersSectionOpen}
          onToggle={() => dispatch({ type: 'toggle', key: 'markersSectionOpen' })}
          visible={markersVisible}
          onToggleVisible={() => setMarkersVisible((v) => !v)}
          localMarkers={markers.localMarkers}
          tracks={meta.tracks}
          onSeek={engine.seek}
          onEditMarker={markers.editMarker}
          onDelete={markers.deleteMarker}
        />

        <div className="flex-shrink-0 px-3 pb-5 pt-2 border-t border-zinc-800">
          <TransportBar
            state={engine.state}
            currentTime={engine.currentTime}
            duration={engine.duration}
            markers={markers.localMarkers}
            regions={regions.localRegions}
            activeRegionId={activeRegionId}
            countingIn={metronome.countingIn}
            countInBeat={metronome.countInBeat}
            onPlay={engine.play}
            onPause={engine.pause}
            onSeek={engine.seek}
            onSkip={handleSkip}
            onSkipToMarker={handleSkipToMarker}
            onSetActiveRegion={handleSetActiveRegion}
            onCountIn={metronome.handleCountIn}
            tracks={meta.tracks}
            onAddMarker={markers.addMarker}
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

      {ui.chordsOpen && meta.chordsFile && (
        <ChordsPanel
          chordsFile={meta.chordsFile}
          onClose={() => dispatch({ type: 'set', key: 'chordsOpen', value: false })}
        />
      )}

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
