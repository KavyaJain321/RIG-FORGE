import { type NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken, signSocketToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'

/**
 * Issues a short-lived, socket-scoped token for the client-side useSocket hook.
 *
 * IMPORTANT: this deliberately does NOT return the session JWT. The session
 * cookie is httpOnly precisely so page JS can't read it; handing the raw
 * session token back to JS would defeat that (any XSS could steal a 7-day
 * session). Instead we mint a separate ~2-minute, socket-only token.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value

  if (!token) return errorResponse('Unauthorized', 401)

  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  const socketToken = signSocketToken(payload.userId)
  if (!socketToken) return errorResponse('Could not issue socket token', 500)

  return NextResponse.json({ data: { token: socketToken } })
}
