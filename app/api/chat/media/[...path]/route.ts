import { type NextRequest, NextResponse } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'

const BUCKET = 'chat-media'
const SIGNED_TTL_SECONDS = 300

// GET /api/chat/media/<area>/<conversationId>/<file>
//
// Authenticated proxy for PRIVATE chat media. The chat-media bucket is private, so
// uploaded images / voice notes / files have no public URL. Messages instead store a
// stable proxy path (this route); the client renders it like any URL and the browser
// sends the session cookie. We verify the requester is a member of the conversation,
// then 302-redirect to a short-lived signed URL. Works identically for REST + realtime
// (the stored value never expires; only the signed URL we mint per-request does).
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

  const admin = getSupabaseAdmin()
  if (!admin) return errorResponse('Storage not configured', 500)

  const objectPath = segments.join('/')
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(objectPath, SIGNED_TTL_SECONDS)
  if (error || !data?.signedUrl) return errorResponse('Media not found', 404)

  const res = NextResponse.redirect(data.signedUrl, 302)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
