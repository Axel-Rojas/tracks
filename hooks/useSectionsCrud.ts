'use client'

import { useCallback, useRef, useState } from 'react'
import type { Section } from '@/lib/types'
import { DEFAULT_SECTION_COLOR } from '@/lib/colors'

interface SectionsCrudOptions {
  initialSections: Section[]
  save: (patch: { localSections: Section[] }) => void
}

export function useSectionsCrud({ initialSections, save }: SectionsCrudOptions) {
  const [localSections, setLocalSections] = useState<Section[]>(initialSections)
  // Numera S1, S2, … sin reusar nombres: si borrás S2 y creás otra, es S3.
  const countRef = useRef(initialSections.length)

  const hydrate = useCallback((sections: Section[]) => {
    setLocalSections(sections)
    countRef.current = sections.length
  }, [])

  const addSection = useCallback(
    (start: number, end: number) => {
      countRef.current += 1
      const section: Section = {
        id: `local-section-${countRef.current}-${Date.now()}`,
        label: `S${countRef.current}`,
        start,
        end,
        color: DEFAULT_SECTION_COLOR,
      }
      setLocalSections((prev) => {
        const updated = [...prev, section].sort((a, b) => a.start - b.start)
        save({ localSections: updated })
        return updated
      })
      return section.id
    },
    [save]
  )

  const editSection = useCallback(
    (index: number, patch: Partial<Section>) => {
      setLocalSections((prev) => {
        const updated = prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
        save({ localSections: updated })
        return updated
      })
    },
    [save]
  )

  const updateSectionBounds = useCallback(
    (id: string, start: number, end: number) => {
      setLocalSections((prev) => {
        if (!prev.some((s) => s.id === id)) return prev
        const updated = prev.map((s) => (s.id === id ? { ...s, start, end } : s))
        save({ localSections: updated })
        return updated
      })
    },
    [save]
  )

  const deleteSection = useCallback(
    (index: number) => {
      let deletedId: string | undefined
      setLocalSections((prev) => {
        deletedId = prev[index]?.id
        const updated = prev.filter((_, i) => i !== index)
        save({ localSections: updated })
        return updated
      })
      return deletedId
    },
    [save]
  )

  return { localSections, hydrate, addSection, editSection, updateSectionBounds, deleteSection }
}
