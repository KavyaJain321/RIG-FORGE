import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { pinMessage } from '@/lib/chat/service'

// POST /api/chat/messages/[messageId]/pin — { pin: boolean }. Pin/unpin in the chat.
export async function POST(request: NextRequest, { params }: { params: { messageId: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    await pinMessage(params.messageId, payload.userId, body.pin === true)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /Not a member/i.test(message) ? 403 : 400)
  }
}
