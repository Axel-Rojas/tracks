'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marker, Section } from '@/lib/types'
import { UI } from '@/lib/constants'

interface PersistedState {
  localMarkers: Marker[]
  localSections: Section[]
  localBpm: number | null
}

/** Lo guardado antes de que "regiones" pasara a llamarse "secciones". */
interface LegacyState {
  localRegions?: Section[]
}

const defaultState = (): PersistedState => ({
  localMarkers: [],
  localSections: [],
  localBpm: null,
})

export function usePlayerState(songId: string) {
  const key = `player-state-${songId}`

  const [persisted, setPersisted] = useState<PersistedState>(defaultState)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // El setState va sí o sí en un effect: la página se prerenderiza en el server,
  // donde no existe localStorage. Leerlo en un initializer de useState o durante
  // el render rompería el SSR o daría hydration mismatch. La alternativa formal
  // sería useSyncExternalStore, pero este hook también escribe (con debounce),
  // así que no es un store externo puro.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const { localRegions, ...parsed } = JSON.parse(raw) as Partial<PersistedState> & LegacyState
        // Las secciones guardadas como `localRegions` siguen valiendo: se leen
        // una vez y el primer save las reescribe con el nombre nuevo.
        const migrated = parsed.localSections ?? localRegions
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPersisted({ ...defaultState(), ...parsed, ...(migrated ? { localSections: migrated } : {}) })
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
