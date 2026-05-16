'use client'

import { rawUrl } from '@/lib/songs'

interface Props {
  songId: string
  chordsFile: string
  onClose: () => void
}

export default function ChordsPanel({ songId, chordsFile, onClose }: Props) {
  const url = rawUrl(`songs/${songId}/${chordsFile}`)

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/80" onClick={onClose}>
      <div
        className="ml-auto w-full max-w-lg h-full bg-zinc-900 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-white">Acordes</h2>
          <button
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-zinc-700 text-zinc-400 text-xl touch-manipulation"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <iframe
          src={url}
          className="flex-1 w-full"
          title="Acordes PDF"
        />
      </div>
    </div>
  )
}
