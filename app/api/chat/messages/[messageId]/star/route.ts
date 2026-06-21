import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { toggleStar } from '@/lib/chat/service'

// POST /api/chat/messages/[messageId]/star — toggle the caller's star (private).
export async function POST(request: NextRequest, { params }: { params: { messageId: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const result = await toggleStar(params.messageId, payload.userId)
    return successResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /Not a member/i.test(message) ? 403 : 400)
  }
}
