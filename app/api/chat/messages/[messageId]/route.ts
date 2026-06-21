import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { editMessage, deleteForEveryone } from '@/lib/chat/service'

function statusFor(message: string): number {
  return /your own|deleted|window|text messages/i.test(message) ? 403 : 400
}

// PATCH /api/chat/messages/[messageId] — edit own text message ({ content }).
export async function PATCH(request: NextRequest, { params }: { params: { messageId: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const content = typeof body.content === 'string' ? body.content : ''
    if (!content.trim()) return errorResponse('content is required', 400)

    const message = await editMessage(params.messageId, payload.userId, content)
    return successResponse({ message })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, statusFor(message))
  }
}

// DELETE /api/chat/messages/[messageId] — delete own message for everyone.
export async function DELETE(request: NextRequest, { params }: { params: { messageId: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    await deleteForEveryone(params.messageId, payload.userId)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, statusFor(message))
  }
}
