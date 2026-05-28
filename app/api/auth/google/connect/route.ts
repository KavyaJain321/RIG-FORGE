/**
 * GET /api/auth/google/connect
 *
 * Starts the OAuth flow. Builds the state token (a signed JWT containing
 * the userId), then redirects to Google's consent screen.
 *
 * The state token is what protects against CSRF — when Google calls our
 * callback, we verify the state to make sure the request came from US,
 * not from a malicious third party trying to bind their account to ours.
 */

import { type NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'
import { buildConnectUrl, isGoogleConfigured } from '@/lib/google/oauth'

const STATE_TTL_SECONDS = 600  // 10 minutes — user must complete OAuth within this window

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return errorResponse(
      'Google integration is not configured. Ask an admin to set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI.',
      503,
    )
  }

  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  const secret = process.env.JWT_SECRET
  if (!secret) return errorResponse('JWT_SECRET not set', 500)

  // Sign a state token tying this OAuth round-trip to this user
  const stateToken = jwt.sign(
    { userId: claims.userId, purpose: 'google-oauth' },
    secret,
    { expiresIn: STATE_TTL_SECONDS },
  )

  const consentUrl = buildConnectUrl(stateToken)
  return NextResponse.redirect(consentUrl)
}
