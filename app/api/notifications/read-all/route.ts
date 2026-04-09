import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    await prisma.notification.updateMany({
      where: { userId: payload.userId, read: false },
      data: { read: true },
    })

    return successResponse({ success: true })
  } catch (error) {
    console.error('[PATCH /api/notifications/read-all]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
