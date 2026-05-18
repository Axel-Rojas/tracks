'use client'

import { useEffect, useRef } from 'react'
import type { Region } from '@/lib/types'
import type { EngineState } from '@/hooks/useAudioEngine'

interface RegionLoopOptions {
  engineState: EngineState
  currentTime: number
  activeRegionId: string | null
  allRegions: Region[]
  seek: (t: number) => void
}

export function useRegionLoop({ engineState, currentTime, activeRegionId, allRegions, seek }: RegionLoopOptions) {
  const loopingRef = useRef(false)

  useEffect(() => {
    if (engineState !== 'playing') return
    if (!activeRegionId) return
    const region = allRegions.find((r) => r.id === activeRegionId)
    if (!region) return
    if (!loopingRef.current && currentTime >= region.end) {
      loopingRef.current = true
      seek(region.start)
      requestAnimationFrame(() => { loopingRef.current = false })
    }
  }, [currentTime, engineState, activeRegionId, allRegions, seek])
}
