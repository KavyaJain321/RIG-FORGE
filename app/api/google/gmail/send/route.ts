import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { sendMessage, isUserGmailEnabled } from '@/lib/assistant/tools/gmail'

// POST /api/google/gmail/send — { to, subject, body, cc? } — send / reply from RF.
export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGmailEnabled(payload.userId))) return errorResponse('Gmail not connected', 403)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const to = String(body.to ?? '').trim()
    const subject = String(body.subject ?? '').trim()
    const text = String(body.body ?? '')
    if (!to || !text) return errorResponse('to and body are required', 400)
    const result = await sendMessage(payload.userId, {
      to,
      subject: subject || '(no subject)',
      body: text,
      cc: typeof body.cc === 'string' ? body.cc : undefined,
    })
    return successResponse(result)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to send', 500)
  }
}
