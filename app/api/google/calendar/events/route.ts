import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listEvents, isUserGcalConnected } from '@/lib/assistant/tools/gcal'

// GET /api/google/calendar/events — upcoming events (next 7 days) for the Meet panel.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGcalConnected(payload.userId))) return errorResponse('Calendar not connected', 403)
    const events = await listEvents(payload.userId, { limit: 15 })
    return successResponse({ events })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load events', 500)
  }
}
