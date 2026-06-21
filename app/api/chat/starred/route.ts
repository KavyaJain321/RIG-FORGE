import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listStarred } from '@/lib/chat/service'

// GET /api/chat/starred — the caller's starred messages across all chats.
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const messages = await listStarred(payload.userId)
    return successResponse({ messages })
  } catch (error) {
    console.error('[GET /api/chat/starred]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
