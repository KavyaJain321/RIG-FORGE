import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { createEvent, isUserGcalConnected } from '@/lib/assistant/tools/gcal'

// POST /api/google/meet/new — create an instant Google Meet (a 30-min calendar
// event with a Meet conference) and return the join link. Body (optional): { title }.
export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGcalConnected(payload.userId))) return errorResponse('Calendar not connected', 403)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Instant meeting'

    const start = new Date()
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    const event = await createEvent(payload.userId, {
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      withMeetLink: true,
    })
    return successResponse({ meetLink: event.meetLink, eventUrl: event.eventUrl })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to create meeting', 500)
  }
}
