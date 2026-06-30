import { type NextRequest, NextResponse } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'
import { signedDownloadUrl, r2Configured } from '@/lib/storage/r2'
import { prisma } from '@/lib/db'

// GET /api/chat/media/<area>/<conversationId>/<file>
//
// Authenticated proxy for PRIVATE chat media. Objects in R2 are private; messages
// store a stable proxy path (this route), so the client renders it like any URL and
// the browser sends the session cookie. We verify the requester is a member of the
// conversation, then 302-redirect to a short-lived signed URL served by our `rf-media`
// Worker. Works identically for REST + realtime (the stored path never expires; only
// the signed URL we mint per-request does).
export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  const segments = params.path || []
  const area = segments[0]
  const conversationId = segments[1]
  if ((area !== 'messages' && area !== 'groups') || !conversationId) {
    return errorResponse('Not found', 404)
  }

  // Only conversation members may fetch its media.
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: payload.userId } },
    select: { id: true },
  })
  if (!member) return errorResponse('Forbidden', 403)

  if (!r2Configured()) return errorResponse('Storage not configured', 500)

  const objectKey = segments.join('/')
  const url = signedDownloadUrl(objectKey)
  if (!url) return errorResponse('Media not found', 404)

  const res = NextResponse.redirect(url, 302)
  // Cache the redirect briefly (< the signed URL's TTL) so rapid re-renders reuse
  // the same signed URL and hit the browser's image cache.
  res.headers.set('Cache-Control', 'private, max-age=3600')
  return res
}
