import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isNasEnabled, nasFetchBytes } from '@/lib/nas/client'
import { sendMessage, isUserGmailEnabled, guessMimeType } from '@/lib/assistant/tools/gmail'
import { isGoogleReauthError } from '@/lib/google/oauth'

export const runtime = 'nodejs'
export const maxDuration = 60

// Gmail's hard attachment cap is ~25MB; stay under to leave MIME overhead room.
const MAX_ATTACH = 20 * 1024 * 1024

// POST /api/nas/share-email  { server, path, to, subject?, body? }
// Emails a NAS file as an attachment from the caller's connected Gmail.
export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)
  if (!isNasEnabled()) return errorResponse('NAS is not available', 403)
  if (!(await isUserGmailEnabled(claims.userId))) {
    return errorResponse('Connect Gmail (Profile → Connect Google) to email files.', 403)
  }

  let body: { server?: string; path?: string; to?: string; subject?: string; body?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON', 400)
  }
  const { server, path, to } = body
  if (!server || !path || !to) return errorResponse('server, path and to are required', 400)

  const filename = path.split('/').filter(Boolean).pop() || 'file'
  try {
    const buf = await nasFetchBytes(server, path, MAX_ATTACH + 1)
    if (buf.length > MAX_ATTACH) {
      return errorResponse(`File is too large to email (${Math.round(buf.length / 1e6)}MB > 20MB). Use a share link instead.`, 413)
    }
    const res = await sendMessage(claims.userId, {
      to,
      subject: body.subject?.trim() || `File: ${filename}`,
      body: body.body?.trim() || `Sharing "${filename}" from the NAS.`,
      attachments: [{ filename, mimeType: guessMimeType(filename), content: buf }],
    })
    return successResponse({ ok: true, id: res.id, to, filename })
  } catch (e) {
    if (isGoogleReauthError(e)) return errorResponse('Reconnect your Google account to send email.', 401)
    return errorResponse(e instanceof Error ? e.message : 'Failed to email file', 502)
  }
}
