import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { blockUser, unblockUser } from '@/lib/chat/service'

// POST /api/chat/users/[userId]/block — { block: boolean } — block/unblock a user.
export async function POST(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (body.block === false) {
      await unblockUser(payload.userId, params.userId)
    } else {
      await blockUser(payload.userId, params.userId)
    }
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, 400)
  }
}
