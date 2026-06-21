import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { setChatFlags } from '@/lib/chat/service'

// POST /api/chat/conversations/[id]/settings — per-user chat settings.
// Body: { archived?: boolean, pinned?: boolean, muteHours?: number|null, cleared?: boolean }
// muteHours: >0 mutes for that many hours, 0/null unmutes (use a huge value for "always").
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const flags: { isArchived?: boolean; isPinned?: boolean; muteUntil?: Date | null; cleared?: boolean } = {}
    if (typeof body.archived === 'boolean') flags.isArchived = body.archived
    if (typeof body.pinned === 'boolean') flags.isPinned = body.pinned
    if (body.muteHours !== undefined) {
      const h = Number(body.muteHours)
      flags.muteUntil = h > 0 ? new Date(Date.now() + h * 3600 * 1000) : null
    }
    if (body.cleared === true) flags.cleared = true

    await setChatFlags(params.id, payload.userId, flags)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /Not a member/i.test(message) ? 403 : 400)
  }
}
