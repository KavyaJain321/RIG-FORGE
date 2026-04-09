import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, COOKIE_NAME } from '@/lib/auth'
import { successResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    const payload = token ? verifyToken(token) : null

    if (payload?.userId) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      await Promise.all([
        prisma.user.update({ where: { id: payload.userId }, data: { currentStatus: 'NOT_WORKING' } }),
        prisma.dailyActivity.upsert({
          where: { userId_date: { userId: payload.userId, date: today } },
          update: { lastSeenAt: new Date() },
          create: { userId: payload.userId, date: today, wasActive: true, lastSeenAt: new Date() },
        }),
      ])
    }

    const response = successResponse({ success: true })
    response.cookies.set(COOKIE_NAME, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
    return response
  } catch (error) {
    console.error('[POST /api/auth/logout]', error)
    // Even on error, clear the cookie
    const response = successResponse({ success: true })
    response.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
    return response
  }
}
