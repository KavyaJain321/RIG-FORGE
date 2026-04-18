import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { NotificationType } from '@prisma/client'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// ─── POST /api/notifications/admin-send ──────────────────────────────────────
// Admin-only. Sends a notification to one user (targetUserId) or all users (targetUserId = "ALL").
//
// Body: { targetUserId: string; title: string; body: string; type?: string; linkTo?: string }

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)
    if (!isAdminRole(payload.role)) return errorResponse('Admin access required', 403)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    const {
      targetUserId,
      title,
      body: notifBody,
      type: typeRaw = 'ADMIN_MESSAGE',
      linkTo = null,
    } = body as {
      targetUserId?: string
      title?: string
      body?: string
      type?: string
      linkTo?: string | null
    }

    // Validate & cast to enum — fall back to ADMIN_MESSAGE
    const type: NotificationType =
      typeRaw in NotificationType
        ? (typeRaw as NotificationType)
        : NotificationType.ADMIN_MESSAGE

    if (!targetUserId) return errorResponse('targetUserId is required', 400)
    if (!title?.trim()) return errorResponse('title is required', 400)
    if (!notifBody?.trim()) return errorResponse('body is required', 400)

    if (targetUserId === 'ALL') {
      // Send to every non-onboarding user
      const users = await prisma.user.findMany({
        where: { isOnboarding: false },
        select: { id: true },
      })

      if (users.length === 0) return successResponse({ sent: 0 })

      await prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type,
          title: title.trim(),
          body: notifBody.trim(),
          read: false,
          linkTo,
        })),
      })

      return successResponse({ sent: users.length })
    }

    // Single user — support lookup by ID or email
    const isEmail = targetUserId.includes('@')
    const targetUser = await prisma.user.findFirst({
      where: isEmail ? { email: targetUserId } : { id: targetUserId },
      select: { id: true },
    })
    if (!targetUser) return errorResponse('Target user not found', 404)

    await prisma.notification.create({
      data: {
        userId: targetUser.id,
        type,
        title: title.trim(),
        body: notifBody.trim(),
        read: false,
        linkTo,
      },
    })

    return successResponse({ sent: 1 })
  } catch (err) {
    console.error('[POST /api/notifications/admin-send]', err)
    return errorResponse('An unexpected error occurred', 500)
  }
}
