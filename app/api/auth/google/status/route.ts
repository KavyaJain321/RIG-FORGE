/**
 * GET /api/auth/google/status
 *
 * Returns whether the caller has Google connected, and if so, which
 * account. Used by the Profile page to show "Connected as X" or the
 * "Connect Google" button.
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isGoogleConfigured } from '@/lib/google/oauth'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  const configured = isGoogleConfigured()

  if (!configured) {
    return successResponse({
      configured: false,
      connected: false,
      email: null,
      connectedAt: null,
    })
  }

  const integ = await prisma.googleIntegration.findUnique({
    where: { userId: claims.userId },
    select: { email: true, connectedAt: true },
  })

  return successResponse({
    configured: true,
    connected: integ !== null,
    email: integ?.email ?? null,
    connectedAt: integ?.connectedAt ?? null,
  })
}
