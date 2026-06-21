import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'

// POST /api/push/subscribe — save a Web Push subscription for the current user.
// Body: { subscription: { endpoint, keys: { p256dh, auth } } }
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }
    const sub = body.subscription
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return errorResponse('Invalid subscription', 400)

    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId: payload.userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { userId: payload.userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, 400)
  }
}

// DELETE /api/push/subscribe — remove a subscription (on unsubscribe). Body: { endpoint }
export async function DELETE(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => ({}))) as { endpoint?: string }
    if (body.endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: payload.userId } })
    }
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, 400)
  }
}
