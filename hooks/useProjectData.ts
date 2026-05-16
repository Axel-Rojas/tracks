'use client'

import { useEffect, useState } from 'react'
import { fetchJson } from '@/lib/songs'
import type { SongMeta } from '@/lib/types'

export function useProjectData(songId: string) {
  const [meta, setMeta] = useState<SongMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJson<SongMeta>(`songs/${songId}/metadata.json`)
      .then(setMeta)
      .catch(() => setError('No se pudo cargar la canción.'))
  }, [songId])

  return { meta, error }
}
