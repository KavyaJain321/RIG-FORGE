/**
 * GET /api/assistant/standup-digest
 *
 * Returns today's standup digest if one exists, else the most recent.
 * Used by the dashboard standup card.
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const todays = await prisma.standupDigest.findUnique({
    where: { date: today },
    select: { id: true, date: true, summary: true, generatedAt: true },
  })
  if (todays) {
    return successResponse({ digest: todays, isToday: true })
  }

  const latest = await prisma.standupDigest.findFirst({
    orderBy: { date: 'desc' },
    select: { id: true, date: true, summary: true, generatedAt: true },
  })
  return successResponse({ digest: latest, isToday: false })
}
