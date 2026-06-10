/**
 * GET /api/dev/forgie-usage/[userId]
 *
 * HIDDEN developer-only endpoint (DEV_DASHBOARD_EMAILS allowlist). Returns the
 * full Forgie history for one user: every conversation (web + WhatsApp) with
 * its messages, plus the write-actions Forgie executed on their behalf.
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isDeveloperEmail } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)
  if (!isDeveloperEmail(claims.email)) return errorResponse('Not found', 404)

  const { userId } = params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, whatsappNumber: true },
  })
  if (!user) return errorResponse('User not found', 404)

  const [conversations, actions] = await Promise.all([
    prisma.assistantConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        channel: true,
        title: true,
        isPinned: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            provider: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.assistantAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        action: true,
        args: true,
        result: true,
        success: true,
        error: true,
        createdAt: true,
      },
    }),
  ])

  return successResponse({ user, conversations, actions })
}
