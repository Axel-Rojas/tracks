'use client'

export default function PlayerError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-zinc-900 gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold text-red-400">Error al cargar el player</h2>
      <p className="text-sm text-zinc-400 max-w-md">{error.message}</p>
      <button
        onClick={reset}
        className="h-10 px-5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-sm text-white font-medium transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
