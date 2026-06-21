import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { markDelivered } from '@/lib/chat/service'

// POST /api/chat/messages/[messageId]/delivered — recipient's client acks that
// it received the message (double-grey "delivered" tick). Idempotent, set once.
export async function POST(
  request: NextRequest,
  { params }: { params: { messageId: string } },
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    await markDelivered(params.messageId, payload.userId)
    return successResponse({ ok: true })
  } catch (error) {
    console.error('[POST /api/chat/messages/[messageId]/delivered]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
