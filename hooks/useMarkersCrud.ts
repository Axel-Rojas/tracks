'use client'

import { useCallback, useRef, useState } from 'react'
import type { Marker } from '@/lib/types'

interface MarkersCrudOptions {
  initialMarkers: Marker[]
  getCurrentTime: () => number
  save: (patch: { localMarkers: Marker[] }) => void
}

export function useMarkersCrud({ initialMarkers, getCurrentTime, save }: MarkersCrudOptions) {
  const [localMarkers, setLocalMarkers] = useState<Marker[]>(initialMarkers)
  const countRef = useRef(initialMarkers.length)

  const hydrate = useCallback((markers: Marker[]) => {
    setLocalMarkers(markers)
    countRef.current = markers.length
  }, [])

  const addMarker = useCallback((trackIndex: number) => {
    countRef.current += 1
    const marker: Marker = {
      time: Math.round(getCurrentTime() * 10) / 10,
      label: `M${countRef.current}`,
      trackIndex,
    }
    setLocalMarkers((prev) => {
      const updated = [...prev, marker]
      save({ localMarkers: updated })
      return updated
    })
  }, [getCurrentTime, save])

  const editMarker = useCallback((index: number, label: string, trackIndex: number | undefined) => {
    setLocalMarkers((prev) => {
      const updated = prev.map((m, i) => i === index ? { ...m, label, trackIndex } : m)
      save({ localMarkers: updated })
      return updated
    })
  }, [save])

  const deleteMarker = useCallback((index: number) => {
    setLocalMarkers((prev) => {
      const updated = prev.filter((_, i) => i !== index)
      save({ localMarkers: updated })
      return updated
    })
  }, [save])

  return { localMarkers, hydrate, addMarker, editMarker, deleteMarker }
}
