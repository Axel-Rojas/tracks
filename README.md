# Tracks

Web application for practicing piano along multi-track audio. Each song is split into separate stems (vocals, instrumental) that can be mixed individually during playback, with support for loop regions, markers, and BPM-aware practice tools.

## Overview

Built with Next.js 16 (App Router), React 19, and TypeScript. Audio playback runs entirely through the Web Audio API via a custom engine; WaveSurfer.js is used exclusively for waveform visualization and UI interaction (seeking, region rendering). This separation is intentional — WaveSurfer's internal playback events are not reliable when the time position is updated externally via `ws.setTime()`, so all playback logic lives in the engine.

Deployed to Vercel. Song processing (stem separation) is a local-only development workflow.

## Features

**Player**

- Multi-track playback with per-track volume control
- Synchronized waveform display for each track
- Loop regions: define a time range, activate it, and playback loops between start and end indefinitely
- Markers: named time points for quick navigation
- BPM tap detection and metronome with adjustable volume
- Count-in (4-beat) before playback starts
- Chords panel (PDF viewer) per song
- All player state (volumes, active region, markers, regions, BPM) persisted to localStorage per song

**Studio (dev only)**

- Upload a raw MP3, fill in metadata, and the server separates it into stems using Demucs
- Real-time processing progress streamed to the browser via Server-Sent Events (phase labels, progress bar, ETA)
- Optional chords PDF upload
- Creates the song directory, audio files, and metadata.json automatically; updates songs.json

**PWA**

- Web app manifest and service worker for installability on mobile
- Cache-first strategy for app shell assets; audio files are never cached

## Architecture

```
app/
  layout.tsx              Root layout, PWA metadata, service worker registration
  page.tsx                Song list (server component, reads songs.json)
  song/[id]/
    page.tsx              Song page (server component, reads metadata.json)
    PlayerClient.tsx      Main player orchestration: state, callbacks, loop logic
  studio/
    page.tsx              Studio entry (dev-only guard)
    StudioClient.tsx      Upload form with SSE progress tracking
  api/studio/route.ts     POST: run Demucs via Python subprocess, stream SSE; GET: list songs
  sw-register.tsx         Client component that registers /sw.js

components/Player/
  MultiTrackWaveform.tsx  WaveSurfer instances per track, region/marker rendering, seek events
  TransportBar.tsx        Play/pause, skip, seek slider, region/marker controls, metronome
  RegionsSection.tsx      Region list UI (create, edit, delete, activate)
  MarkersSection.tsx      Marker list UI
  ChordsPanel.tsx         PDF chords viewer
  BpmTapModal.tsx         BPM detection by tapping

hooks/
  useAudioEngine.ts       Web Audio API engine: decode, play, pause, seek, per-track gain, RAF tick
  usePlayerState.ts       localStorage persistence with 500ms debounce save
  useProjectData.ts       Song metadata fetching

lib/
  types.ts                Shared TypeScript interfaces (SongMeta, Track, Region, Marker, SongIndex)
  songs.ts                Asset URL helpers
  songs.server.ts         Server-side filesystem reads from public/

public/
  songs.json              Ordered list of all songs (id, title, artist)
  songs/{id}/
    metadata.json         Song definition (tracks, markers, regions, bpm, chordsFile)
    Voz.mp3               Vocals stem
    Instrumental.mp3      Instrumental stem
    [acordes.pdf]         Optional chords file
  manifest.json           PWA manifest
  sw.js                   Service worker
  icon.svg                App icon

scripts/
  add_song.py             CLI: separate a raw MP3 into stems using Demucs
```

## Song Data Format

Each song is defined by `public/songs/{id}/metadata.json`:

```json
{
  "id": "song-slug",
  "title": "Song Title",
  "artist": "Artist Name",
  "bpm": 120,
  "tracks": [
    { "id": "instrumental", "label": "Instrumental", "file": "Instrumental.mp3", "defaultVolume": 1 },
    { "id": "voz", "label": "Voz", "file": "Voz.mp3", "defaultVolume": 1 }
  ],
  "markers": [{ "time": 32.5, "label": "Coro" }],
  "regions": [
    { "id": "region-1", "label": "Puente", "start": 64, "end": 96, "color": "rgba(96,165,250,0.20)" }
  ],
  "chordsFile": "acordes.pdf"
}
```

`public/songs.json` holds the ordered index used for the song list. The first entry appears first in the UI.

## Audio Engine

`useAudioEngine` decodes all track audio files into `AudioBuffer` on load, then plays them in sync by scheduling `AudioBufferSourceNode` instances against the same `AudioContext`. Seeking stops all sources and restarts them from the new offset. Per-track volume is controlled by individual `GainNode` instances. Playback position is tracked via a `requestAnimationFrame` loop that updates `currentTime` state.

WaveSurfer is synchronized to the engine's `currentTime` via `ws.setTime()` on every React render. Because WaveSurfer is not driving playback, its internal playback events (`region-out`, `timeupdate`) do not fire — the loop region check runs in a `useEffect` watching `engine.currentTime` directly in `PlayerClient.tsx`.

## Adding Songs

### Via Studio (browser, dev only)

Navigate to `/studio`. Upload the original MP3, fill in the metadata, and submit. The server saves the file temporarily and runs `scripts/add_song.py`, streaming progress back to the browser via SSE. Processing takes 2-5 minutes depending on song length.

### Via CLI

```bash
python scripts/add_song.py path/to/song.mp3 --title "Title" --artist "Artist"
python scripts/add_song.py path/to/song.mp3 --title "Title" --artist "Artist" --bpm 120 --id custom-id
```

The script converts the input to WAV (required for Python 3.13+ torchaudio compatibility), runs Demucs with `--two-stems=vocals`, renames the outputs to `Voz.mp3` and `Instrumental.mp3`, writes `metadata.json`, and inserts the entry at the top of `songs.json`.

After processing, commit the new song directory and updated `songs.json` to deploy to Vercel.

### Prerequisites for song processing

```bash
pip install demucs
winget install ffmpeg   # Windows — must be in PATH before starting the dev server
```

## Development

```bash
pnpm install
pnpm dev
```

The studio is available at `/studio` in development only. In production, the route returns 404 and the API returns 403.

## Deployment

Push to main. Vercel builds and serves the app. Audio files are committed to the repository and served as static assets. There is no server-side audio processing in production.
