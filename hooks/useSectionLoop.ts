'use client'

import { useEffect, useRef } from 'react'
import type { Section } from '@/lib/types'
import type { EngineState } from '@/hooks/useAudioEngine'

interface SectionLoopOptions {
  engineState: EngineState
  currentTime: number
  activeSectionId: string | null
  allSections: Section[]
  seek: (t: number) => void
}

export function useSectionLoop({
  engineState,
  currentTime,
  activeSectionId,
  allSections,
  seek,
}: SectionLoopOptions) {
  const loopingRef = useRef(false)

  useEffect(() => {
    if (engineState !== 'playing') return
    if (!activeSectionId) return
    const section = allSections.find((s) => s.id === activeSectionId)
    if (!section) return
    if (!loopingRef.current && currentTime >= section.end) {
      loopingRef.current = true
      seek(section.start)
      requestAnimationFrame(() => { loopingRef.current = false })
    }
  }, [currentTime, engineState, activeSectionId, allSections, seek])
}
