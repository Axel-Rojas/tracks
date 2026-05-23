import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

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
    return songs.map((s) => ({ id: s.slug, title: s.title, artist: s.artist }))
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
      chordsFile: song.chordsFile,
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
    chordsFile: v.optional(v.string()),
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

// One-time migration helper — accepts explicit slug to preserve existing IDs.
// Idempotent: skips if slug already exists.
export const seed = mutation({
  args: {
    title: v.string(),
    artist: v.string(),
    slug: v.string(),
    bpm: v.optional(v.number()),
    isPublic: v.boolean(),
    ownerId: v.optional(v.string()),
    chordsFile: v.optional(v.string()),
    tracks: v.array(trackSchema),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("songs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()
    if (existing) return null
    return ctx.db.insert("songs", args)
  },
})
