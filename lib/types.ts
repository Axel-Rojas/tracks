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

export interface Region {
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
  chordsFile?: string
}

export interface SongIndex {
  id: string
  title: string
  artist: string
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
