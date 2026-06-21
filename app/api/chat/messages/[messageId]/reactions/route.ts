import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { setReaction } from '@/lib/chat/service'

// POST /api/chat/messages/[messageId]/reactions — { emoji }.
// Toggles the caller's reaction (same emoji removes, new emoji replaces).
export async function POST(request: NextRequest, { params }: { params: { messageId: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const emoji = typeof body.emoji === 'string' ? body.emoji.slice(0, 8) : ''
    if (!emoji) return errorResponse('emoji is required', 400)

    await setReaction(params.messageId, payload.userId, emoji)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /Not a member/i.test(message) ? 403 : 400)
  }
}
