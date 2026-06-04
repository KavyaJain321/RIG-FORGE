/**
 * POST /api/auth/google/disconnect
 *
 * Revokes the user's Google connection at Google's end (best-effort) and
 * deletes the local GoogleIntegration row.
 */

import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { disconnectGoogle } from '@/lib/google/oauth'

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  try {
    await disconnectGoogle(claims.userId)
    return successResponse({ disconnected: true })
  } catch (err) {
    console.error('[google-disconnect]', err)
    return errorResponse('Failed to disconnect', 500)
  }
}
