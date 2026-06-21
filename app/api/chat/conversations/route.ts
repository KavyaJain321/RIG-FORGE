import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listConversations, getOrCreateDm, createGroup } from '@/lib/chat/service'

// GET /api/chat/conversations — list the caller's conversations (DMs + groups),
// newest activity first, each with last message + unread count.
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const conversations = await listConversations(payload.userId)
    return successResponse({ conversations })
  } catch (error) {
    console.error('[GET /api/chat/conversations]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// POST /api/chat/conversations — start a conversation.
//   DM:    { type: "DIRECT", userId: "<other user id>" }   (idempotent)
//   Group: { type: "GROUP", title: "...", memberIds: ["...", ...] }
export async function POST(request: NextRequest) {
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

    const type = body.type
    if (type === 'DIRECT') {
      const otherId = body.userId
      if (typeof otherId !== 'string' || !otherId) {
        return errorResponse('userId is required for a direct message', 400)
      }
      const convo = await getOrCreateDm(payload.userId, otherId)
      return successResponse({ conversation: { id: convo.id, type: convo.type } })
    }

    if (type === 'GROUP') {
      const title = body.title
      const memberIds = body.memberIds
      if (typeof title !== 'string' || !title.trim()) {
        return errorResponse('title is required for a group', 400)
      }
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        return errorResponse('memberIds must be a non-empty array', 400)
      }
      const convo = await createGroup(
        payload.userId,
        title.trim(),
        memberIds.filter((id): id is string => typeof id === 'string'),
      )
      return successResponse({ conversation: { id: convo.id, type: convo.type } })
    }

    return errorResponse('type must be "DIRECT" or "GROUP"', 400)
  } catch (error) {
    console.error('[POST /api/chat/conversations]', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, 400)
  }
}
