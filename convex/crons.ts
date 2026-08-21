import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Cierra corridas fantasma y limpia las terminadas viejas. Cada 5 minutos alcanza:
// el corte de staleness es de 13 y los jobs duran minutos, no días.
crons.interval("sweep stale jobs", { minutes: 5 }, internal.jobs.sweepStale, {})

export default crons
