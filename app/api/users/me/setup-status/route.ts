/**
 * GET /api/users/me/setup-status
 *
 * Lightweight status for the post-login "Finish setting up" prompt: is Google
 * connected, and is a WhatsApp number verified. Used to decide whether to nudge
 * the user (never blocking).
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isGoogleConfigured } from '@/lib/google/oauth'
import { isWhatsAppEnabled } from '@/lib/whatsapp/bridge'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  const [integ, me] = await Promise.all([
    isGoogleConfigured()
      ? prisma.googleIntegration.findUnique({
          where: { userId: claims.userId },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.user.findUnique({
      where: { id: claims.userId },
      select: { whatsappNumber: true, whatsappVerified: true },
    }),
  ])

  const google = {
    configured: isGoogleConfigured(),
    connected: integ !== null,
  }
  const whatsapp = {
    enabled: isWhatsAppEnabled(),
    number: me?.whatsappNumber ?? null,
    hasNumber: Boolean(me?.whatsappNumber),
    verified: Boolean(me?.whatsappVerified),
  }

  // What still needs the user's attention (only count things that are actually
  // available to do).
  const needsGoogle = google.configured && !google.connected
  const needsWhatsapp = whatsapp.enabled && !whatsapp.verified
  const complete = !needsGoogle && !needsWhatsapp

  return successResponse({ google, whatsapp, needsGoogle, needsWhatsapp, complete })
}
