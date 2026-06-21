import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { searchMessages } from '@/lib/chat/service'

// GET /api/chat/conversations/[id]/search?q=... — full-text search within a chat.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const q = request.nextUrl.searchParams.get('q') ?? ''
    const messages = await searchMessages(params.id, payload.userId, q)
    return successResponse({ messages })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/Not a member/i.test(message)) return errorResponse('Forbidden', 403)
    console.error('[GET /api/chat/conversations/[id]/search]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
