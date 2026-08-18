import { Search, Plus } from 'lucide-react'

/**
 * Shell instantáneo del listado: mismo layout que SongListClient para que la
 * lista real entre sin mover nada al terminar el streaming.
 */
export default function SongListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
          <div className="w-full h-10 rounded-xl bg-zinc-800 border border-zinc-700" />
        </div>
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-green-600 flex-shrink-0">
          <Plus size={20} className="text-white" />
        </div>
      </div>

      {/* Contador + hueco del selector de vista, con la misma altura que el real. */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-4 w-24 rounded bg-zinc-800/60 animate-pulse" />
        <div className="h-[34px] w-44 flex-shrink-0 rounded-lg border border-zinc-700 bg-zinc-800" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 items-start">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-2.5">
            <div className="h-4 w-4 rounded bg-zinc-800 flex-shrink-0" />
            <div
              className="h-4 flex-1 max-w-[70%] rounded bg-zinc-800 animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
