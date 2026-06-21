import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listMessages, sendMessage } from '@/lib/chat/service'

// GET /api/chat/conversations/[id]/messages?limit=30&before=<msgId>
// Returns messages oldest → newest. `before` paginates to older messages.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { searchParams } = request.nextUrl
    const limit = parseInt(searchParams.get('limit') ?? '30', 10)
    const before = searchParams.get('before') ?? undefined

    const messages = await listMessages(params.id, payload.userId, { limit, before })
    return successResponse({ messages })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Not a member')) return errorResponse('Forbidden', 403)
    console.error('[GET /api/chat/conversations/[id]/messages]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// POST /api/chat/conversations/[id]/messages  — body: { content: string }
export async function POST(
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

    const content = typeof body.content === 'string' ? body.content : ''
    if (!content.trim()) return errorResponse('content is required', 400)

    const message = await sendMessage(params.id, payload.userId, content)
    return successResponse({ message })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Not a member')) return errorResponse('Forbidden', 403)
    console.error('[POST /api/chat/conversations/[id]/messages]', error)
    return errorResponse(message || 'An unexpected error occurred', 400)
  }
}
