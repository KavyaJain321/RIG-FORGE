import { type NextRequest } from 'next/server'
import { type NotificationType } from '@prisma/client'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// Ticket notification types — employees should never see these
const TICKET_TYPES: NotificationType[] = [
  'TICKET_RAISED',
  'TICKET_ACCEPTED',
  'TICKET_COMPLETED',
  'TICKET_CANCELLED',
]

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

    // Employees must not see ticket notifications
    const typeFilter = isAdminRole(payload.role)
      ? {}
      : { type: { notIn: TICKET_TYPES } }

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: payload.userId, ...typeFilter },
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
        where: { userId: payload.userId, read: false, ...typeFilter },
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

// ─── DELETE /api/notifications ────────────────────────────────────────────────
// Body: { ids: string[] }  — deletes the given notification IDs for the current user

export async function DELETE(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    let body: unknown
    try { body = await request.json() } catch { body = {} }

    const ids = (body as Record<string, unknown>).ids
    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse('ids must be a non-empty array', 400)
    }

    // Only delete notifications that belong to this user
    const { count } = await prisma.notification.deleteMany({
      where: { id: { in: ids as string[] }, userId: payload.userId },
    })

    return successResponse({ deleted: count })
  } catch (error) {
    console.error('[DELETE /api/notifications]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
