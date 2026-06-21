import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { joinViaInvite } from '@/lib/chat/service'

// POST /api/chat/invite/join — { token } — join a group via its invite link.
export async function POST(request: NextRequest) {
  try {
    const authToken = getTokenFromCookies(request)
    if (!authToken) return errorResponse('Authentication required', 401)
    const payload = verifyToken(authToken)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.token !== 'string' || !body.token) return errorResponse('token is required', 400)

    const conversationId = await joinViaInvite(body.token, payload.userId)
    return successResponse({ conversationId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /Invalid or expired/i.test(message) ? 404 : 400)
  }
}
