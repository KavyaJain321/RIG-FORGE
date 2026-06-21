import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { markRead } from '@/lib/chat/service'

// POST /api/chat/conversations/[id]/read — mark the conversation read up to now.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    await markRead(params.id, payload.userId)
    return successResponse({ ok: true })
  } catch (error) {
    console.error('[POST /api/chat/conversations/[id]/read]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
