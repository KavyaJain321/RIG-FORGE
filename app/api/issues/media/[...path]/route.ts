import { type NextRequest, NextResponse } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'
import { tokenCan } from '@/lib/permissions'
import { signedDownloadUrl, r2Configured } from '@/lib/storage/r2'

// GET /api/issues/media/issues/<org>/<file>
//
// Authenticated, admin-only proxy for private issue screenshots stored in R2.
// Mirrors the chat-media proxy: verify the requester, then 302-redirect to a
// short-lived signed URL served by the rf-media Worker.
export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  if (!tokenCan(payload, 'members.view')) return errorResponse('Admin access required', 403)

  const segments = params.path || []
  if (segments[0] !== 'issues' || segments.length < 3) return errorResponse('Not found', 404)

  if (!r2Configured()) return errorResponse('Storage not configured', 500)

  const url = signedDownloadUrl(segments.join('/'))
  if (!url) return errorResponse('Media not found', 404)

  const res = NextResponse.redirect(url, 302)
  res.headers.set('Cache-Control', 'private, max-age=3600')
  return res
}
