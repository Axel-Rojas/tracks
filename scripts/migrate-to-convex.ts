/**
 * One-shot migration: reads public/songs.json + public/songs/{id}/metadata.json
 * and seeds each song into Convex. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx --env-file .env.local scripts/migrate-to-convex.ts
 */
import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import { readFile } from "fs/promises"
import { join } from "path"
import type { SongIndex, SongMeta } from "../lib/types"

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL
if (!CONVEX_URL) throw new Error("NEXT_PUBLIC_CONVEX_URL no está definido en .env.local")

const client = new ConvexHttpClient(CONVEX_URL)

async function readPublicJson<T>(path: string): Promise<T> {
  const raw = await readFile(join(process.cwd(), "public", path), "utf-8")
  return JSON.parse(raw) as T
}

async function migrateSong(song: SongIndex): Promise<"inserted" | "skipped" | "error"> {
  let meta: SongMeta
  try {
    meta = await readPublicJson<SongMeta>(`songs/${song.id}/metadata.json`)
  } catch {
    console.warn(`  ⚠  ${song.id} — sin metadata.json, saltando`)
    return "error"
  }

  const tracks = meta.tracks.map((t) => ({
    ...t,
    file: `songs/${song.id}/${t.file}`,
  }))

  const chordsFile = meta.chordsFile
    ? `songs/${song.id}/${meta.chordsFile}`
    : undefined

  try {
    const result = await client.mutation(api.songs.seed, {
      title: meta.title,
      artist: meta.artist,
      slug: song.id,
      bpm: meta.bpm,
      isPublic: true,
      chordsFile,
      tracks,
    })

    if (result === null) {
      console.log(`  →  ${song.id} (ya existía, saltado)`)
      return "skipped"
    }
    console.log(`  ✓  ${song.id}`)
    return "inserted"
  } catch (err) {
    console.error(`  ✗  ${song.id}: ${err}`)
    return "error"
  }
}

async function main() {
  const songs = await readPublicJson<SongIndex[]>("songs.json")
  console.log(`Encontradas ${songs.length} canciones en songs.json\n`)

  const results = await Promise.all(songs.map(migrateSong))

  const inserted = results.filter((r) => r === "inserted").length
  const skipped = results.filter((r) => r === "skipped").length
  const failed = results.filter((r) => r === "error").length

  console.log(`\nListo: ${inserted} insertadas, ${skipped} saltadas, ${failed} errores`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
