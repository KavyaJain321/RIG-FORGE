import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// ─── GET /api/notifications/count ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const count = await prisma.notification.count({
      where: { userId: payload.userId, read: false },
    })

    return successResponse({ count })
  } catch (error) {
    console.error('[GET /api/notifications/count]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
