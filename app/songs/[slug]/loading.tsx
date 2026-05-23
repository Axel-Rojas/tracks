import { ChevronRight } from 'lucide-react'

export default function SongLoading() {
  return (
    <div className="flex h-dvh bg-zinc-900 overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 flex-shrink-0">
          <div className="h-9 w-9 rounded-lg bg-zinc-800 animate-pulse" />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="h-4 w-40 rounded bg-zinc-800 animate-pulse" />
            <div className="h-3 w-24 rounded bg-zinc-800/60 animate-pulse" />
          </div>
        </header>

        <div className="flex-1 min-h-0 px-3 py-3">
          <div className="flex flex-col gap-1.5 h-full">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex-1 min-h-0 bg-zinc-800/50 rounded-lg animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800 flex-shrink-0">
          <div className="w-full flex items-center gap-2 px-4 py-2.5">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest flex-1">Regiones</span>
            <span className="text-zinc-600"><ChevronRight size={16} /></span>
          </div>
        </div>

        <div className="border-t border-zinc-800 flex-shrink-0">
          <div className="w-full flex items-center gap-2 px-4 py-2.5">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest flex-1">Marcadores</span>
            <span className="text-zinc-600"><ChevronRight size={16} /></span>
          </div>
        </div>

        <div className="flex-shrink-0 px-3 pb-5 pt-2 border-t border-zinc-800">
          <div className="flex items-center justify-center gap-4">
            <div className="h-10 w-10 rounded-full bg-zinc-800 animate-pulse" />
            <div className="h-12 w-12 rounded-full bg-zinc-800 animate-pulse" />
            <div className="h-10 w-10 rounded-full bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
