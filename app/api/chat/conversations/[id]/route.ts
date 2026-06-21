import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { renameGroup, setGroupImage, setGroupSettings } from '@/lib/chat/service'

function statusFor(message: string): number {
  return /admin|Not a member/i.test(message) ? 403 : 400
}

// PATCH /api/chat/conversations/[id] — update group: { title?, imageUrl? }
// (imageUrl is normally set via the /image upload route; accepted here too.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return errorResponse('Request body must be valid JSON', 400)
    }

    if (typeof body.title === 'string') {
      await renameGroup(params.id, payload.userId, body.title)
    }
    if (typeof body.imageUrl === 'string') {
      await setGroupImage(params.id, payload.userId, body.imageUrl)
    }
    if (typeof body.description === 'string' || typeof body.onlyAdminsCanSend === 'boolean') {
      await setGroupSettings(params.id, payload.userId, {
        description: typeof body.description === 'string' ? body.description : undefined,
        onlyAdminsCanSend: typeof body.onlyAdminsCanSend === 'boolean' ? body.onlyAdminsCanSend : undefined,
      })
    }
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, statusFor(message))
  }
}
