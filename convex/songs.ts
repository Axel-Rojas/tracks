import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { closeJob } from "./jobs"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

const trackSchema = v.object({
  id: v.string(),
  label: v.string(),
  file: v.string(),
  defaultVolume: v.number(),
})

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const songs = await ctx.db
      .query("songs")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect()
    return songs.map((s) => ({
      id: s.slug,
      title: s.title,
      artist: s.artist,
      trackCount: s.tracks.length,
    }))
  },
})

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const song = await ctx.db
      .query("songs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
    if (!song) return null
    return {
      id: song.slug,
      title: song.title,
      artist: song.artist,
      bpm: song.bpm,
      tracks: song.tracks,
    }
  },
})

// Used by the public add-song interface. Generates slug from title; appends artist on collision.
export const create = mutation({
  args: {
    title: v.string(),
    artist: v.string(),
    bpm: v.optional(v.number()),
    isPublic: v.boolean(),
    ownerId: v.optional(v.string()),
    tracks: v.array(trackSchema),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("songs")
      .withIndex("by_title_artist", (q) =>
        q.eq("title", args.title).eq("artist", args.artist)
      )
      .first()
    if (duplicate) {
      throw new Error(`"${args.title}" de "${args.artist}" ya existe`)
    }

    const base = slugify(args.title)
    let slug = base
    if (
      await ctx.db
        .query("songs")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      slug = `${base}-${slugify(args.artist)}`
      let suffix = 2
      while (
        await ctx.db
          .query("songs")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .unique()
      ) {
        slug = `${base}-${slugify(args.artist)}-${suffix++}`
      }
    }

    return ctx.db.insert("songs", { ...args, slug })
  },
})

/** Files in `from` that no track in `keep` points at — they are orphans in R2. */
function unreferencedFiles(from: { file: string }[], keep: { file: string }[]): string[] {
  const kept = new Set(keep.map((t) => t.file))
  return from.map((t) => t.file).filter((f) => !kept.has(f))
}

// Entry point for the Modal worker and scripts/add_song.py — accepts an explicit
// slug, which is also what let it double as the one-time migration helper.
//
// Idempotent per slug with one exception: a run that brings MORE tracks than the
// stored ones (2 -> 4) replaces them. Never the other way around — re-uploading
// with fewer stems must not clobber a finer separation.
//
// Returns the files left unreferenced so the caller can delete them from R2: the
// old ones when replacing, the just-uploaded ones when the run is discarded.
//
// Cuando viene `jobId` cierra el job en la misma transacción que decide el
// veredicto. Es a propósito: si el worker mandara el "done" por su cuenta habría
// una ventana donde la canción ya está publicada y el job sigue colgado porque el
// container murió entre una llamada y la otra.
export const seed = mutation({
  args: {
    title: v.string(),
    artist: v.string(),
    slug: v.string(),
    bpm: v.optional(v.number()),
    isPublic: v.boolean(),
    ownerId: v.optional(v.string()),
    tracks: v.array(trackSchema),
    // Ausente en dev: scripts/add_song.py corre sin job.
    jobId: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, ...args }) => {
    const existing = await ctx.db
      .query("songs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    if (!existing) {
      await ctx.db.insert("songs", { ...args })
      await closeJob(ctx, jobId, "done")
      return {
        action: "created" as const,
        trackCount: args.tracks.length,
        orphanFiles: [] as string[],
      }
    }

    if (args.tracks.length <= existing.tracks.length) {
      await closeJob(
        ctx,
        jobId,
        "error",
        `No se reemplazó nada: "${args.slug}" ya tiene ${existing.tracks.length} pistas ` +
          `y esta corrida traía ${args.tracks.length}.`,
      )
      return {
        action: "skipped" as const,
        trackCount: existing.tracks.length,
        orphanFiles: unreferencedFiles(args.tracks, existing.tracks),
      }
    }

    // Only the tracks (and bpm when given) are touched: title/artist/isPublic/ownerId
    // belong to the stored document and may have been edited after it was created.
    await ctx.db.patch(existing._id, {
      tracks: args.tracks,
      ...(args.bpm !== undefined ? { bpm: args.bpm } : {}),
    })
    await closeJob(ctx, jobId, "done")
    return {
      action: "replaced" as const,
      trackCount: args.tracks.length,
      orphanFiles: unreferencedFiles(existing.tracks, args.tracks),
    }
  },
})
