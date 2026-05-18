'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marker, Region } from '@/lib/types'
import { UI } from '@/lib/constants'

interface PersistedState {
  localMarkers: Marker[]
  localRegions: Region[]
  localBpm: number | null
}

const defaultState = (): PersistedState => ({
  localMarkers: [],
  localRegions: [],
  localBpm: null,
})

export function usePlayerState(songId: string) {
  const key = `player-state-${songId}`

  const [persisted, setPersisted] = useState<PersistedState>(defaultState)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>
        setPersisted({ ...defaultState(), ...parsed })
      }
    } catch { /* ignore */ }
  }, [key])

  const save = useCallback(
    (patch: Partial<PersistedState>) => {
      setPersisted((prev) => {
        const next = { ...prev, ...patch }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
        }, UI.PERSIST_DEBOUNCE_MS)
        return next
      })
    },
    [key]
  )

  return { persisted, save }
}
