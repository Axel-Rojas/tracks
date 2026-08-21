import { internalMutation, mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
// Compartido con el front y con /api/studio para que la regla de stems viva en un
// solo lugar. `lib/studio.ts` no importa nada a propósito: el bundler de Convex
// arrastra este archivo al deploy, así que meterle una dependencia de Node o de
// React rompe el push.
import { stemPlan, blockedStemMessage } from "../lib/studio"

/**
 * Modal corta la función a los 600s (`timeout=600` en modal_worker/app.py). Un job
 * que sigue vivo pasado ese margen ya no va a escribir nunca más: o lo mató el
 * runtime o se cayó el container antes de poder reportar el error.
 */
const STALE_MS = 13 * 60 * 1000

/** Los jobs terminados se guardan un rato para que el studio pueda mostrarlos. */
const KEEP_FINISHED_MS = 7 * 24 * 60 * 60 * 1000

async function byJobId(ctx: MutationCtx, jobId: string): Promise<Doc<"jobs"> | null> {
  return ctx.db
    .query("jobs")
    .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
    .unique()
}

/**
 * Cierra un job desde otra mutation (la usa `songs:seed`, que es la que sabe de
 * verdad si la corrida sirvió). Silenciosa si el job no existe: en dev no hay job
 * y el script local igual llama a seed.
 */
export async function closeJob(
  ctx: MutationCtx,
  jobId: string | undefined,
  status: "done" | "error",
  message?: string,
): Promise<void> {
  if (!jobId) return
  const job = await byJobId(ctx, jobId)
  if (!job || job.status === "done" || job.status === "error") return
  await ctx.db.patch(job._id, { status, ...(message !== undefined ? { message } : {}) })
}

/**
 * Crea el job antes de mandar nada a Modal. Es el único punto donde se decide si
 * una corrida arranca, así que acá viven los dos rechazos:
 *
 * 1. La regla de stems (solo se reemplaza hacia arriba), la misma que aplica
 *    `songs:seed` al final. Sin este corte Demucs corre igual y el resultado se
 *    descarta después de varios minutos.
 * 2. Un job ya activo sobre el mismo slug. Este no tenía red en ningún lado: dos
 *    envíos seguidos con un slug nuevo pasaban los dos (la canción todavía no
 *    existe en `songs` hasta que la primera corrida termina) y se pagaban dos
 *    GPUs para publicar una.
 */
export const start = mutation({
  args: {
    jobId: v.string(),
    slug: v.string(),
    title: v.string(),
    artist: v.string(),
    bpm: v.optional(v.number()),
    // Espejo de STEM_MODES en lib/studio.ts.
    stems: v.union(v.literal(2), v.literal(4)),
  },
  handler: async (ctx, rawArgs) => {
    // Mismo criterio que songs:seed: el slug identifica la canción sin importar
    // mayúsculas, o se termina con dos documentos para la misma canción.
    const args = { ...rawArgs, slug: rawArgs.slug.trim().toLowerCase() }

    const song = await ctx.db
      .query("songs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    if (song && stemPlan(song.tracks.length, args.stems) === "blocked") {
      return { ok: false as const, message: blockedStemMessage(song.tracks.length, args.stems) }
    }

    // Alcanza con mirar los últimos: mientras hay uno activo este mismo chequeo
    // impide crear otro, así que un job vivo siempre está entre los más nuevos.
    const recent = await ctx.db
      .query("jobs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .order("desc")
      .take(20)

    if (recent.some((j) => j.status === "pending" || j.status === "running")) {
      return {
        ok: false as const,
        message: `Ya hay una corrida procesando "${args.slug}". Esperá a que termine.`,
      }
    }

    await ctx.db.insert("jobs", { ...args, status: "pending" })
    return { ok: true as const }
  },
})

/**
 * La llama el worker de Modal en cada hito (descarga, separación, subida) y
 * /api/studio si no logra encolar la corrida.
 *
 * Tolerante a propósito: un update perdido no puede voltear una corrida de seis
 * minutos, y un job ya cerrado no se revive — si `songs:seed` o el barrido lo
 * cerraron primero, ese mensaje es más preciso que el que trae el worker.
 */
export const update = mutation({
  args: {
    jobId: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    phase: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, status, phase, message }) => {
    const job = await byJobId(ctx, jobId)
    if (!job || job.status === "done" || job.status === "error") return null

    await ctx.db.patch(job._id, {
      status,
      ...(phase !== undefined ? { phase } : {}),
      ...(message !== undefined ? { message } : {}),
    })
    return null
  },
})

/**
 * Lo que mira el studio. Es una live query, así que reemplaza al polling: el
 * progreso sobrevive a cerrar la pestaña y se ve desde cualquier dispositivo.
 */
export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").order("desc").take(20)
    return jobs.map((j) => ({
      jobId: j.jobId,
      slug: j.slug,
      title: j.title,
      artist: j.artist,
      stems: j.stems,
      status: j.status,
      phase: j.phase,
      message: j.message,
      at: j._creationTime,
    }))
  },
})

/**
 * Un container que muere duro nunca reporta nada: sin esto el job queda "running"
 * para siempre y el studio muestra una corrida fantasma. Corre por cron.
 */
export const sweepStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()

    // El índice ordena por status y después por fecha de creación ascendente, así
    // que estos son los más viejos de cada estado: justo los candidatos.
    for (const status of ["pending", "running"] as const) {
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(50)

      for (const job of jobs) {
        if (now - job._creationTime < STALE_MS) break
        await ctx.db.patch(job._id, {
          status: "error",
          message: "El worker no reportó en el tiempo esperado. Probá de nuevo.",
        })
      }
    }

    for (const status of ["done", "error"] as const) {
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(50)

      for (const job of jobs) {
        if (now - job._creationTime < KEEP_FINISHED_MS) break
        await ctx.db.delete(job._id)
      }
    }

    return null
  },
})
