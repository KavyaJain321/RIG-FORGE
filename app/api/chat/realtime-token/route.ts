import { type NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// GET /api/chat/realtime-token — mints a short-lived Supabase-compatible JWT so the
// realtime socket is authenticated AS this user. Supabase Realtime then enforces RLS
// (postgres_changes only delivers rows the user can SELECT → their conversations only).
//
// Claims: sub = RF userId (read by rf_uid() in RLS policies), role/aud = 'authenticated'
// so the `TO authenticated` policies apply. Signed with the project's JWT secret.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) return errorResponse('Realtime is not configured (SUPABASE_JWT_SECRET missing)', 503)

  const realtimeToken = jwt.sign(
    { sub: payload.userId, role: 'authenticated', aud: 'authenticated' },
    secret,
    { expiresIn: '12h' },
  )
  return successResponse({ token: realtimeToken })
}
