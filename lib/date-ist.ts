/**
 * IST (UTC+5:30) calendar-day helpers.
 *
 * The team operates in IST, but the server (Render) runs in UTC. Every
 * `@db.Date` column that represents "a day" — DailyLog.date, DailyActivity.date,
 * DailyLogDraft.date — must be keyed by the IST calendar day, NOT the server's
 * local/UTC day. Otherwise "today's" rows split across two different keys after
 * ~18:30 IST (when UTC has already rolled to the next day), so heartbeats, daily
 * logs, and the crons that read them stop lining up.
 *
 * `istDateOnly` returns a Date at UTC-midnight whose Y-M-D equals the IST
 * calendar day. That is exactly what Prisma serializes into a `date` column,
 * so two calls on the same IST day always produce the same stored key.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export function istDateOnly(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()))
}

/**
 * The half-open UTC instant range [start, end) covering the IST calendar day
 * identified by an `istDateOnly` key. Use this for time-window queries (e.g.
 * "activity completed today") so they match the IST day the row is keyed to,
 * rather than a UTC-midnight ± 24h window that's offset by 5h30.
 */
export function istDayRangeFromKey(dateOnly: Date): { start: Date; end: Date } {
  const start = new Date(dateOnly.getTime() - IST_OFFSET_MS)
  return { start, end: new Date(start.getTime() + DAY_MS) }
}
