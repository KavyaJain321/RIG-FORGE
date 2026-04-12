import { type NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'

/**
 * Returns the raw JWT from the session cookie so the client-side
 * useSocket hook can authenticate its WebSocket connection.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value

  if (!token) return errorResponse('Unauthorized', 401)

  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  return NextResponse.json({ data: { token } })
}
