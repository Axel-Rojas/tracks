# Tracks

Web application for practicing piano along multi-track audio. Each song is split into separate stems that can be mixed individually during playback, with support for loop sections, markers, and BPM-aware practice tools.

## Overview

Built with Next.js 16 (App Router), React 19, and TypeScript. Audio playback runs entirely through the Web Audio API via a custom engine; WaveSurfer.js is used exclusively for waveform visualization and UI interaction (seeking, section rendering). This separation is intentional — WaveSurfer's internal playback events are not reliable when the time position is updated externally via `ws.setTime()`, so all playback logic lives in the engine.

Song metadata lives in Convex; audio files live in Cloudflare R2. Deployed to Vercel. Stem separation runs locally via a Python script in development, and on a Modal GPU worker in production.

## Features

**Player**

- Multi-track playback with per-track volume and mute controls
- Global volume slider
- Synchronized waveform display for each track; clicking either waveform seeks to that position
- Loop sections: mark a start and an end, activate the section, and playback loops between them indefinitely
- Markers: named time points for quick navigation
- Visibility toggles to show/hide all markers or sections on the waveform at once
- Song sidebar grouped by artist (alphabetical), collapsible per-artist dropdowns
- BPM tap detection and metronome with adjustable volume
- Count-in (4-beat) before playback starts
- Player state persisted to localStorage per song: local markers, local sections, BPM

**Studio**

- Upload a raw MP3 and the audio is separated into stems using Demucs. Pasting a YouTube URL is development-only: from Modal's datacenter IP the download is blocked, and the session cookies that would unblock it live in the local Firefox profile
- Stem count selector: 2 stems (Voz, Instrumental) or 4 stems (Batería, Bajo, Otros, Voz). Separation takes the same time either way — htdemucs always computes four sources and `--two-stems` merges them at the end — but 4 stems doubles the audio the player downloads and decodes
- Re-processing an existing song only replaces it when the run brings **more** stems than the stored ones (2 → 4). Same or fewer stems is rejected before Demucs runs — the studio greys out the button and `/api/studio` answers 409 — so a finer separation is never clobbered. On a replace, the superseded stems are deleted from R2
- Only one run at a time per song id. The second submit is rejected by `jobs:start` before Demucs runs, so a double submit no longer burns two GPUs to publish one song
- Processing progress: Server-Sent Events in development (phase labels, progress bar, ETA). In production the run is tracked by a `jobs` row in Convex that the studio reads as a live query — closing the tab does not affect it, and the run is visible from any device
- Uploads each stem to `songs/{slug}/` in R2 and registers the song in Convex with one track per stem

**PWA**

- Web app manifest and service worker for installability on mobile
- Cache-first strategy for app shell assets; audio files are never cached

## Architecture

```
app/
  layout.tsx              Root layout, PWA metadata, service worker registration
  page.tsx                Song list (server component, Convex listPublic behind Suspense)
  songs/[slug]/
    page.tsx              Song page (server component, Convex getBySlug)
    PlayerClient.tsx      Main player orchestration: state, callbacks, loop logic
    loading.tsx           Streaming shell for the player
  studio/
    page.tsx              Studio entry, passes isDev to the client
    StudioClient.tsx      Upload form, stem selector, progress tracking
  api/studio/
    route.ts              POST: dev spawns add_song.py and streams SSE; prod calls the Modal webhook
    presign/route.ts      Presigned R2 PUT, so prod uploads bypass Vercel's 4.5MB body limit
  sw-register.tsx         Client component that registers /sw.js

components/SongList/
  SongListClient.tsx      Search, artist/all view toggle, grouped and flat listings
  SongCard.tsx            Song tile
  ResumeBanner.tsx        Invitation to resume the last practiced song
  SongListSkeleton.tsx    Loading shell matching SongListClient's layout

components/Player/
  MultiTrackWaveform.tsx  WaveSurfer instances per track, section/marker rendering, seek events
  TransportBar.tsx        Play/pause, skip, seek slider, section pills, metronome, volume
  SongSidebar.tsx         Song navigation sidebar grouped by artist
  SectionsPanel.tsx       Section list UI (mark start/end to create, edit, delete, activate, visibility)
  MarkersSection.tsx      Marker list UI (visibility toggle)
  BpmTapModal.tsx         BPM detection by tapping

hooks/
  useAudioEngine.ts       Web Audio API engine: decode, play, pause, seek, per-track gain/mute, global volume, RAF tick
  usePlayerState.ts       localStorage persistence with 500ms debounce save
  useMetronome.ts         Metronome scheduling and count-in logic
  useSectionLoop.ts       Loop enforcement: seeks back to section start when currentTime passes section end
  useMarkersCrud.ts       Add, edit, delete, hydrate local markers
  useSectionsCrud.ts      Add, edit, delete, update bounds, hydrate local sections

lib/
  types.ts                Shared TypeScript interfaces (SongMeta, Track, Section, Marker, SongIndex, SSEEvent)
  format.ts               formatTime() and formatTimeAgo() utilities
  colors.ts               Track color palette, section color presets, solidFromRgba()
  constants.ts            AUDIO, PLAYBACK, and UI constants
  studio.ts               Stem modes, parseETA() and inferPhase() for progress display
  songs.ts                R2 URL helper, groupByArtist(), sortByTitle()
  lastSession.ts          Last practiced song, for the resume banner
  r2.ts                   S3 client pointed at R2

convex/
  schema.ts               songs and jobs tables with their indexes
  songs.ts                listPublic, getBySlug, seed
  jobs.ts                 start, update, listRecent, sweepStale (prod run tracking)
  crons.ts                Sweeps stale runs every 5 minutes

modal_worker/
  app.py                  GPU worker: Demucs separation, R2 upload, Convex seed and job updates
  requirements.txt        Local deps needed to deploy the worker (not the remote image)

scripts/
  add_song.py             CLI: separate a raw MP3 into stems using Demucs
```

## Song Data Format

Songs live in the Convex `songs` table (see `convex/schema.ts`). The audio path in each track is a full R2 key, resolved against `NEXT_PUBLIC_R2_URL` at render time:

```jsonc
{
  "title": "Song Title",
  "artist": "Artist Name",
  "slug": "song-slug",
  "bpm": 120,
  "isPublic": true,
  "tracks": [
    { "id": "voz", "label": "Voz", "file": "songs/song-slug/Voz.mp3", "defaultVolume": 0.5 },
    { "id": "instrumental", "label": "Instrumental", "file": "songs/song-slug/Instrumental.mp3", "defaultVolume": 0.5 }
  ]
}
```

Markers and sections are **not** stored in Convex. They are per-user practice annotations kept in localStorage under `player-state-{slug}`, alongside the local BPM override.

## Audio Engine

`useAudioEngine` decodes all track audio files into `AudioBuffer` on load, then plays them in sync by scheduling `AudioBufferSourceNode` instances against the same `AudioContext`. Seeking stops all sources and restarts them from the new offset. Per-track volume is controlled by individual `GainNode` instances. Playback position is tracked via a `requestAnimationFrame` loop that updates `currentTime` state.

WaveSurfer is synchronized to the engine's `currentTime` via `ws.setTime()` on every React render. Because WaveSurfer is not driving playback, its internal playback events (`region-out`, `timeupdate`) do not fire — the loop check runs in `useSectionLoop`, a dedicated hook that watches `engine.currentTime` directly. Only the primary waveform uses WaveSurfer's `interaction` event for seeking; secondary tracks use an `onClick` handler on the container div to avoid feedback loops with WaveSurfer's internal event system.

WaveSurfer's regions plugin is what draws sections and markers on the waveform, so `region` in that code refers to the library's own API and not to the app's `Section` type.

## Adding Songs

### Via Studio (browser)

Navigate to `/studio`, upload the original MP3, pick the stem count, fill in the metadata, and submit.

In development the server saves the file temporarily and runs `scripts/add_song.py`, streaming progress back to the browser via SSE. Either way processing takes roughly 2-5 minutes depending on song length.

In production the browser uploads the MP3 straight to R2 with a presigned URL and `/api/studio` records a run in Convex (`jobs:start`) before handing it to the Modal worker. The worker reports its milestones with `jobs:update`, and `songs:seed` closes the run in the same transaction that decides whether the tracks were kept. Nothing about that chain depends on the browser: the studio reads the runs as a live query, so you can close the tab, switch devices, and come back to the result. A run whose container dies without reporting is closed by the `sweepStale` cron 13 minutes in — Modal's own timeout is 600s.

Pasting a YouTube URL only works in development; in production the API rejects it and asks for the MP3.

### Via CLI

```bash
python scripts/add_song.py path/to/song.mp3 --title "Title" --artist "Artist"
python scripts/add_song.py path/to/song.mp3 --title "Title" --artist "Artist" --bpm 120 --id custom-id
python scripts/add_song.py --youtube-url "https://youtu.be/..." --title "Title" --artist "Artist"
python scripts/add_song.py path/to/song.mp3 --title "Title" --artist "Artist" --stems 4
```

For MP3 input the script converts to WAV first (required for Python 3.13+ torchaudio compatibility). For YouTube input the audio is downloaded directly as WAV via yt-dlp, skipping conversion. YouTube downloads reuse the logged-in session from Firefox by default (`--cookies-from-browser firefox`); pass `--cookies-from-browser none` to download anonymously, or another browser name to read cookies from it instead. Demucs runs with `--two-stems=vocals` by default; `--stems 4` drops that flag and keeps the four sources (`drums`, `bass`, `other`, `vocals`). Each stem is uploaded to `songs/{id}/` in R2 and the song is registered in Convex with one track per stem. The temporary WAV is discarded automatically. Re-running against an existing `--id` replaces its tracks only when this run produces more stems than the stored ones; otherwise the script deletes the stems it just uploaded and exits with an error.

### Prerequisites for song processing

```bash
pip install demucs yt-dlp yt-dlp-ejs
winget install ffmpeg   # Windows — must be in PATH before starting the dev server
```

`yt-dlp-ejs` plus a JS runtime (Node, Deno or Bun — the script picks whichever is installed) are required for YouTube downloads: with session cookies YouTube always serves signed URLs, and without a runtime to solve the signature challenge no audio format is available.

## Development

```bash
pnpm install
pnpm dev
```

The dev server must run on port 3000 — R2's CORS policy only allows that origin, and from any other port audio requests fail with an opaque `Failed to fetch`.

The studio is available at `/studio` in both development and production. The difference is where the work happens: a local Python subprocess in development, the Modal worker in production.

## Deployment

### App

Push to main. Vercel builds and serves the app. Audio is served from R2 and song metadata from Convex, so no audio files are committed to the repository.

### Modal worker

The GPU worker that separates stems in production is deployed separately from the app — pushing to main does **not** update it. After changing `modal_worker/app.py`, deploy it explicitly:

```bash
python -m pip install -r modal_worker/requirements.txt
```

```bash
python -m modal deploy modal_worker/app.py
```

Notes:

- Invoke the CLI as `python -m modal`. Installing the `modal` package does not necessarily put a `modal` executable on PATH.
- `pydantic` is listed as a local dependency because `modal >= 1.5` no longer pulls it in, and the deploy imports `app.py` on your machine to discover the app. Without it the deploy fails with a `ModuleNotFoundError` that points at `app.py` rather than at the missing client package.
- The remote image is defined in `app.py` and built by Modal; `requirements.txt` only covers what the deploy needs locally.
- The worker expects two Modal secrets in the workspace: `practica-piano-r2` (R2 credentials and bucket) and `practica-piano-convex` (`CONVEX_URL`).
- `MODAL_WEBHOOK_URL` in the app's environment must point at the deployed `submit` endpoint.

Check what is currently live before assuming a change shipped:

```bash
python -m modal app history practica-piano
```
