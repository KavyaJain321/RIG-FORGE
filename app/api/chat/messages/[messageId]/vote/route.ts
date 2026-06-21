import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { votePoll } from '@/lib/chat/service'

// POST /api/chat/messages/[messageId]/vote — { optionId } — cast/toggle a poll vote.
export async function POST(request: NextRequest, { params }: { params: { messageId: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.optionId !== 'string') return errorResponse('optionId is required', 400)

    await votePoll(params.messageId, payload.userId, body.optionId)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /Not a member/i.test(message) ? 403 : 400)
  }
}
