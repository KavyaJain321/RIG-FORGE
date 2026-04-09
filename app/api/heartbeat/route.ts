import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await prisma.dailyActivity.upsert({
      where: { userId_date: { userId: payload.userId, date: today } },
      update: { lastSeenAt: new Date(), wasActive: true },
      create: { userId: payload.userId, date: today, wasActive: true, lastSeenAt: new Date() },
    })

    return successResponse({ ok: true })
  } catch (error) {
    console.error('[POST /api/heartbeat]', error)
    return errorResponse('Server error', 500)
  }
}
