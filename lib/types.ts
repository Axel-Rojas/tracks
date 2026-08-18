export interface Track {
  id: string
  label: string
  file: string
  defaultVolume: number
}

export interface Marker {
  time: number
  label: string
  trackIndex?: number  // undefined = track 0 (backwards compat con metadata.json)
}

export interface Section {
  id: string
  label: string
  start: number
  end: number
  color?: string
  trackIndex?: number
}

export interface SongMeta {
  id: string
  title: string
  artist: string
  bpm?: number
  tracks: Track[]
}

export interface SongIndex {
  id: string
  title: string
  artist: string
  // Opcional a propósito: las funciones de Convex se deployan aparte del front,
  // así que entre un deploy y el otro la query todavía puede no mandarlo.
  trackCount?: number
}

export type SSEEvent =
  | { type: 'log'; text: string }
  | { type: 'progress'; pct: number; text: string }
  | { type: 'done'; id: string }
  | { type: 'error'; message: string }

export type JobStatus =
  | { status: 'pending' }
  | { status: 'running'; progress?: number; phase?: string }
  | { status: 'done'; id: string }
  | { status: 'error'; message: string }
