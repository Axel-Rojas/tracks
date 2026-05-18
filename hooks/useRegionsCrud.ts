'use client'

import { useCallback, useRef, useState } from 'react'
import type { Region } from '@/lib/types'
import { DEFAULT_REGION_COLOR } from '@/lib/colors'
import { PLAYBACK } from '@/lib/constants'

interface RegionsCrudOptions {
  initialRegions: Region[]
  getCurrentTime: () => number
  getDuration: () => number
  save: (patch: { localRegions: Region[] }) => void
}

export function useRegionsCrud({ initialRegions, getCurrentTime, getDuration, save }: RegionsCrudOptions) {
  const [localRegions, setLocalRegions] = useState<Region[]>(initialRegions)
  const countRef = useRef(initialRegions.length)

  const hydrate = useCallback((regions: Region[]) => {
    setLocalRegions(regions)
    countRef.current = regions.length
  }, [])

  const addRegion = useCallback(() => {
    countRef.current += 1
    const t = getCurrentTime()
    const region: Region = {
      id: `local-region-${countRef.current}`,
      label: `R${countRef.current}`,
      start: Math.round(t * 10) / 10,
      end: Math.round(Math.min(t + PLAYBACK.NEW_REGION_DURATION, getDuration()) * 10) / 10,
      color: DEFAULT_REGION_COLOR,
    }
    setLocalRegions((prev) => {
      const updated = [...prev, region]
      save({ localRegions: updated })
      return updated
    })
    return true
  }, [getCurrentTime, getDuration, save])

  const editRegion = useCallback((index: number, patch: Partial<Region>) => {
    setLocalRegions((prev) => {
      const updated = prev.map((r, i) => i === index ? { ...r, ...patch } : r)
      save({ localRegions: updated })
      return updated
    })
  }, [save])

  const updateRegionBounds = useCallback((id: string, start: number, end: number) => {
    setLocalRegions((prev) => {
      const index = prev.findIndex((r) => r.id === id)
      if (index < 0) return prev
      const updated = prev.map((r, i) => i === index ? { ...r, start, end } : r)
      save({ localRegions: updated })
      return updated
    })
  }, [save])

  const deleteRegion = useCallback((index: number) => {
    let deletedId: string | undefined
    setLocalRegions((prev) => {
      deletedId = prev[index]?.id
      const updated = prev.filter((_, i) => i !== index)
      save({ localRegions: updated })
      return updated
    })
    return deletedId
  }, [save])

  return { localRegions, hydrate, addRegion, editRegion, updateRegionBounds, deleteRegion }
}
