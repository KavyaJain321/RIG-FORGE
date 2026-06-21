import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { searchMessages, isUserGmailEnabled } from '@/lib/assistant/tools/gmail'

// GET /api/google/gmail/list?q=in:inbox&limit=20 — list mail for the in-app inbox.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGmailEnabled(payload.userId))) return errorResponse('Gmail not connected', 403)
    const url = new URL(request.url)
    const q = url.searchParams.get('q') || 'in:inbox'
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 50)
    const result = await searchMessages(payload.userId, { query: q, limit })
    return successResponse(result)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load mail', 500)
  }
}
