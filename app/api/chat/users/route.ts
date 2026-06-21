import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// GET /api/chat/users — active teammates the caller can start a chat with
// (everyone except themselves). Used by the "new message" / group picker.
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const users = await prisma.user.findMany({
      where: { isActive: true, isOnboarding: false, id: { not: payload.userId } },
      select: { id: true, name: true, email: true, avatarUrl: true, role: true },
      orderBy: { name: 'asc' },
    })
    return successResponse({ users })
  } catch (error) {
    console.error('[GET /api/chat/users]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
