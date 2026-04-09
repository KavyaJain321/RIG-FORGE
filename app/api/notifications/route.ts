import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// ─── GET /api/notifications ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100)
    const cursor = searchParams.get('cursor') ?? undefined

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: payload.userId },
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          read: true,
          linkTo: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: { userId: payload.userId, read: false },
      }),
    ])

    const hasMore = items.length > limit
    const page = hasMore ? items.slice(0, limit) : items
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

    return successResponse({ items: page, nextCursor, unreadCount })
  } catch (error) {
    console.error('[GET /api/notifications]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
