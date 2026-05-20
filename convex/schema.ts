import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  songs: defineTable({
    title: v.string(),
    artist: v.string(),
    slug: v.string(),
    bpm: v.optional(v.number()),
    isPublic: v.boolean(),
    ownerId: v.optional(v.string()),
    chordsFile: v.optional(v.string()),
    tracks: v.array(v.object({
      id: v.string(),
      label: v.string(),
      file: v.string(),        // full path: "songs/blackbird/Voz.mp3"
      defaultVolume: v.number(),
    })),
  })
    .index("by_slug", ["slug"])
    .index("by_public", ["isPublic"])
    .index("by_owner", ["ownerId"])
    .index("by_artist", ["artist"])
    .index("by_title_artist", ["title", "artist"]),
})
