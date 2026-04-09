import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// ─── PATCH /api/notifications/[id] ───────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { id } = params

    // Verify the notification belongs to the current user
    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!notification) return errorResponse('Notification not found', 404)
    if (notification.userId !== payload.userId) return errorResponse('Forbidden', 403)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Request body must be valid JSON', 400)
    }

    const { read } = body as Record<string, unknown>
    if (typeof read !== 'boolean') return errorResponse('read must be a boolean', 400)

    const updated = await prisma.notification.update({
      where: { id },
      data: { read },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        read: true,
        linkTo: true,
        createdAt: true,
      },
    })

    return successResponse(updated)
  } catch (error) {
    console.error('[PATCH /api/notifications/[id]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
