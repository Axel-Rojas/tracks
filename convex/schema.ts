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

  // Una corrida de separación. Existe desde antes de que arranque Demucs (la crea
  // /api/studio) hasta que la cierra songs:seed, así que es lo que le permite al
  // studio mostrar el progreso sin que el usuario tenga la pestaña abierta, y a
  // jobs:start rechazar dos corridas sobre el mismo slug antes de gastar la GPU.
  //
  // Datos operativos de vida corta a propósito separados de `songs`: se reescriben
  // varias veces por corrida y los barre un cron.
  jobs: defineTable({
    // El UUID que genera /api/studio/presign: nace antes que este documento
    // (nombra la key `tmp/{jobId}.mp3`) y es lo único que conoce el worker.
    jobId: v.string(),
    slug: v.string(),
    title: v.string(),
    artist: v.string(),
    bpm: v.optional(v.number()),
    stems: v.number(),
    // Sin auth todavía: queda para cuando el aviso sea por usuario y no general.
    ownerId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("done"),
      v.literal("error"),
    ),
    phase: v.optional(v.string()),
    message: v.optional(v.string()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),
})
