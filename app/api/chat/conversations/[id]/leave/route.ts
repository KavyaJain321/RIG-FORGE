import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { leaveGroup } from '@/lib/chat/service'

// POST /api/chat/conversations/[id]/leave — caller leaves the group.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    await leaveGroup(params.id, payload.userId)
    return successResponse({ ok: true })
  } catch (error) {
    console.error('[POST /api/chat/conversations/[id]/leave]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
