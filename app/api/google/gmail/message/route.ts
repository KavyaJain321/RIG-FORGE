import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { getMessage, isUserGmailEnabled } from '@/lib/assistant/tools/gmail'
import { isGoogleReauthError } from '@/lib/google/oauth'

// GET /api/google/gmail/message?id=<messageId> — full message body for the reading pane.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGmailEnabled(payload.userId))) return errorResponse('Gmail not connected', 403)
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return errorResponse('id is required', 400)
    const message = await getMessage(payload.userId, { messageId: id })
    return successResponse(message)
  } catch (error) {
    if (isGoogleReauthError(error)) return errorResponse('Reconnect your Google account to use Mail.', 401)
    return errorResponse(error instanceof Error ? error.message : 'Failed to load message', 500)
  }
}
