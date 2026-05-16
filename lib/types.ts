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
}

export interface SongMeta {
  id: string
  title: string
  artist: string
  bpm?: number
  tracks: Track[]
  markers: Marker[]
  regions: Region[]
  chordsFile?: string
}

export interface SongIndex {
  id: string
  title: string
  artist: string
}
