import { type NextRequest } from 'next/server'
import type { ModelMessage } from 'ai'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { createEvent, isUserGcalConnected } from '@/lib/assistant/tools/gcal'
import { isGoogleReauthError } from '@/lib/google/oauth'
import { generate } from '@/lib/llm/generate'
import { APP_NAME } from '@/lib/branding'

// POST /api/google/meet/schedule — { request: "<natural language>" }
// Forgie turns the request into a Google Calendar event with a Meet link.
export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGcalConnected(payload.userId))) return errorResponse('Reconnect your Google account to schedule meetings.', 401)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const text = String(body.request ?? '').trim()
    if (!text) return errorResponse('Describe the meeting to schedule', 400)

    const nowIso = new Date().toISOString()
    const sys = `Extract a calendar meeting from the user's request. The user's timezone is Asia/Kolkata (IST, +05:30). NOW (UTC) is ${nowIso}. Reply with ONLY a JSON object, no prose, no code fences:
{"title": string, "start": ISO8601-UTC, "end": ISO8601-UTC, "attendees": string[] /* names of people mentioned, [] if none */}
Default the duration to 30 minutes if no end is implied. Resolve relative dates ("tomorrow", "Friday 3pm") against NOW in IST, then output UTC.`
    const messages: ModelMessage[] = [
      { role: 'system', content: sys },
      { role: 'user', content: text },
    ]
    const result = await generate(messages)
    let parsed: { title?: string; start?: string; end?: string; attendees?: string[] }
    try {
      const raw = (result.text || '').replace(/```json|```/g, '').trim()
      parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
    } catch {
      return errorResponse("Couldn't understand the time — try e.g. \"sync with Pranav tomorrow 3pm for 30 min\".", 400)
    }
    if (!parsed.title || !parsed.start || !parsed.end) return errorResponse("Couldn't extract a title and time — please rephrase.", 400)

    // Resolve mentioned names → teammate emails.
    let attendeeEmails: string[] = []
    if (parsed.attendees?.length) {
      const users = await prisma.user.findMany({ where: { isActive: true }, select: { name: true, email: true } })
      attendeeEmails = parsed.attendees
        .map((n) => users.find((u) => u.name.toLowerCase().includes(n.toLowerCase()) || u.email.toLowerCase().startsWith(n.toLowerCase()))?.email)
        .filter((e): e is string => Boolean(e))
    }

    // Use OUR in-app call link (opens the embedded call inside RF), not Google Meet.
    const slug = parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24)
    const room = `rigforge-${slug ? slug + '-' : ''}${Math.random().toString(36).slice(2, 8)}`
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
    const callLink = `${base}/dashboard/workspace?call=${room}`

    const event = await createEvent(payload.userId, {
      title: parsed.title,
      start: parsed.start,
      end: parsed.end,
      attendees: attendeeEmails,
      withMeetLink: false,
      description: `${APP_NAME} video call — join here:\n${callLink}`,
    })
    return successResponse({ id: event.id, title: event.title, start: event.start, meetLink: callLink, eventUrl: event.eventUrl, attendees: attendeeEmails })
  } catch (error) {
    if (isGoogleReauthError(error)) return errorResponse('Reconnect your Google account to schedule meetings.', 401)
    return errorResponse(error instanceof Error ? error.message : 'Failed to schedule the meeting', 500)
  }
}
