import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { createInvite, revokeInvite } from '@/lib/chat/service'

// POST /api/chat/conversations/[id]/invite — { action: "create" | "revoke" }.
// Admin-only. "create" returns the invite token (reused if one exists).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (body.action === 'revoke') {
      await revokeInvite(params.id, payload.userId)
      return successResponse({ inviteToken: null })
    }
    const inviteToken = await createInvite(params.id, payload.userId)
    return successResponse({ inviteToken })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /admin|Not a member/i.test(message) ? 403 : 400)
  }
}
