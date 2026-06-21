import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { createPoll } from '@/lib/chat/service'

// POST /api/chat/conversations/[id]/poll — { question, options: string[], multi? }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const question = String(body.question ?? '')
    const options = Array.isArray(body.options) ? body.options.map((o) => String(o)) : []
    const multi = body.multi === true

    await createPoll(params.id, payload.userId, question, options, multi)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, /Not a member|admin/i.test(message) ? 403 : 400)
  }
}
