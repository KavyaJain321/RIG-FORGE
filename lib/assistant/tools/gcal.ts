/**
 * Google Calendar + Meet tools for Forgie.
 *
 * Per-user tools — each tool runs against the CALLER'S calendar, using
 * their stored OAuth tokens. If the user hasn't connected Google, the
 * tools return null (the LLM sees an empty result and tells the user).
 *
 * Auth lives in lib/google/oauth.ts. We use getAuthorizedClient(userId)
 * which auto-refreshes the access token if it's near expiry.
 */

import { google } from 'googleapis'
import { prisma } from '@/lib/db'
import { getAuthorizedClient, isGoogleConfigured } from '@/lib/google/oauth'

const PRIMARY_CALENDAR = 'primary'

// ─── Feature flag check ─────────────────────────────────────────────────────

export function isGcalConfigured(): boolean {
  return isGoogleConfigured()
}

export async function isUserGcalConnected(userId: string): Promise<boolean> {
  if (!isGoogleConfigured()) return false
  const integ = await prisma.googleIntegration.findUnique({
    where: { userId },
    select: { id: true },
  })
  return integ !== null
}

// ─── Tool: list_events ──────────────────────────────────────────────────────

export interface ListEventsArgs {
  /** ISO datetime; default = now */
  timeMin?: string
  /** ISO datetime; default = now + 7d */
  timeMax?: string
  /** Optional substring filter on event title */
  query?: string
  limit?: number
}

export async function listEvents(userId: string, args: ListEventsArgs = {}) {
  const auth = await getAuthorizedClient(userId)
  const cal = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const timeMin = args.timeMin ?? now.toISOString()
  const timeMax = args.timeMax ?? week.toISOString()
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)

  const res = await cal.events.list({
    calendarId: PRIMARY_CALENDAR,
    timeMin,
    timeMax,
    singleEvents: true,           // expand recurring events
    orderBy: 'startTime',
    maxResults: limit,
    q: args.query,                // server-side substring filter
  })

  const events = res.data.items ?? []
  return events.map((e) => ({
    id: e.id,
    title: e.summary ?? '(untitled)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    location: e.location ?? null,
    description: e.description?.slice(0, 200) ?? null,
    attendees:
      e.attendees?.map((a) => ({
        email: a.email,
        name: a.displayName ?? null,
        status: a.responseStatus,  // accepted / declined / tentative / needsAction
      })) ?? [],
    meetLink: e.hangoutLink ?? null,
    eventUrl: e.htmlLink ?? null,
    isAllDay: e.start?.date !== undefined && e.start?.dateTime === undefined,
  }))
}

// ─── Tool: find_free_time ───────────────────────────────────────────────────

export interface FindFreeTimeArgs {
  /** Email addresses to check (including the caller for self-availability) */
  attendees: string[]
  /** Required slot duration in minutes (default 30) */
  durationMinutes?: number
  /** ISO datetime lower bound (default now) */
  rangeStart?: string
  /** ISO datetime upper bound (default rangeStart + 7d) */
  rangeEnd?: string
  /** Optional: only consider these hours (24h format). Default 9-18 IST equivalent in user's tz */
  workingHoursStart?: number
  workingHoursEnd?: number
  limit?: number
}

export async function findFreeTime(userId: string, args: FindFreeTimeArgs) {
  if (!args.attendees || args.attendees.length === 0) {
    return { error: 'No attendees provided' }
  }

  const auth = await getAuthorizedClient(userId)
  const cal = google.calendar({ version: 'v3', auth })

  const duration = Math.min(Math.max(args.durationMinutes ?? 30, 5), 480)
  const start = args.rangeStart ?? new Date().toISOString()
  const endDefault = new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000)
  const end = args.rangeEnd ?? endDefault.toISOString()

  const fb = await cal.freebusy.query({
    requestBody: {
      timeMin: start,
      timeMax: end,
      items: args.attendees.map((email) => ({ id: email })),
    },
  })

  // Combine all attendees' busy intervals
  const busy: Array<{ start: number; end: number }> = []
  for (const [, info] of Object.entries(fb.data.calendars ?? {})) {
    for (const slot of info.busy ?? []) {
      if (slot.start && slot.end) {
        busy.push({ start: new Date(slot.start).getTime(), end: new Date(slot.end).getTime() })
      }
    }
  }
  busy.sort((a, b) => a.start - b.start)

  // Merge overlapping busy intervals
  const merged: Array<{ start: number; end: number }> = []
  for (const slot of busy) {
    const last = merged[merged.length - 1]
    if (last && slot.start <= last.end) {
      last.end = Math.max(last.end, slot.end)
    } else {
      merged.push({ ...slot })
    }
  }

  // Find free gaps of >= duration minutes within the range
  const rangeStartMs = new Date(start).getTime()
  const rangeEndMs = new Date(end).getTime()
  const durationMs = duration * 60 * 1000

  const workStart = args.workingHoursStart ?? 9
  const workEnd = args.workingHoursEnd ?? 18

  const free: Array<{ start: string; end: string }> = []
  let cursor = rangeStartMs

  for (const slot of merged) {
    if (slot.start > cursor) {
      // gap before this busy slot
      const gapStart = cursor
      const gapEnd = slot.start
      pushIfFitsAndInsideWorkHours(free, gapStart, gapEnd, durationMs, workStart, workEnd)
    }
    cursor = Math.max(cursor, slot.end)
  }
  if (cursor < rangeEndMs) {
    pushIfFitsAndInsideWorkHours(free, cursor, rangeEndMs, durationMs, workStart, workEnd)
  }

  return {
    attendees: args.attendees,
    durationMinutes: duration,
    candidateSlots: free.slice(0, args.limit ?? 10),
  }
}

function pushIfFitsAndInsideWorkHours(
  out: Array<{ start: string; end: string }>,
  rangeStart: number,
  rangeEnd: number,
  durationMs: number,
  workStart: number,
  workEnd: number,
): void {
  // Walk through each day in the range and split by work hours
  let cur = new Date(rangeStart)
  while (cur.getTime() < rangeEnd) {
    const dayStart = new Date(cur)
    dayStart.setHours(workStart, 0, 0, 0)
    const dayEnd = new Date(cur)
    dayEnd.setHours(workEnd, 0, 0, 0)

    const slotStart = new Date(Math.max(cur.getTime(), dayStart.getTime()))
    const slotEnd = new Date(Math.min(rangeEnd, dayEnd.getTime()))

    if (slotEnd.getTime() - slotStart.getTime() >= durationMs) {
      out.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() })
    }

    // Move to next day's start
    const next = new Date(cur)
    next.setDate(next.getDate() + 1)
    next.setHours(0, 0, 0, 0)
    cur = next
  }
}

// ─── Write: createEvent ──────────────────────────────────────────────────────

export interface CreateEventArgs {
  title: string
  start: string           // ISO datetime
  end: string             // ISO datetime
  attendees?: string[]    // email addresses
  description?: string
  location?: string
  withMeetLink?: boolean  // default true if attendees present
}

export async function createEvent(userId: string, args: CreateEventArgs) {
  const auth = await getAuthorizedClient(userId)
  const cal = google.calendar({ version: 'v3', auth })

  const wantsMeet = args.withMeetLink ?? (args.attendees && args.attendees.length > 0)

  const res = await cal.events.insert({
    calendarId: PRIMARY_CALENDAR,
    sendUpdates: 'all',
    conferenceDataVersion: wantsMeet ? 1 : 0,
    requestBody: {
      summary: args.title.trim(),
      description: args.description?.trim(),
      location: args.location?.trim(),
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: args.attendees?.map((email) => ({ email })),
      ...(wantsMeet && {
        conferenceData: {
          createRequest: {
            requestId: `forgie-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  })

  const ev = res.data
  return {
    id: ev.id,
    title: ev.summary,
    start: ev.start?.dateTime ?? ev.start?.date,
    end: ev.end?.dateTime ?? ev.end?.date,
    meetLink: ev.hangoutLink ?? null,
    eventUrl: ev.htmlLink,
    attendees: ev.attendees?.map((a) => a.email) ?? [],
  }
}

// ─── Write: cancelEvent ──────────────────────────────────────────────────────

export interface CancelEventArgs {
  eventId: string
}

export async function cancelEvent(userId: string, args: CancelEventArgs) {
  const auth = await getAuthorizedClient(userId)
  const cal = google.calendar({ version: 'v3', auth })

  await cal.events.delete({
    calendarId: PRIMARY_CALENDAR,
    eventId: args.eventId,
    sendUpdates: 'all',
  })

  return { cancelled: true, eventId: args.eventId }
}
