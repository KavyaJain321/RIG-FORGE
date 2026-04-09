import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { comparePassword, signToken, COOKIE_NAME } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { AuthUser, ApiResponse } from '@/lib/types'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<AuthUser> | ApiResponse<never>>> {
  try {
    let body: unknown
    try { body = await request.json() } catch { return errorResponse('Request body must be valid JSON', 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Request body must be a JSON object', 400)
    const { email, password } = body as Record<string, unknown>
    if (!email || typeof email !== 'string' || email.trim().length === 0) return errorResponse('email is required', 400)
    if (!password || typeof password !== 'string' || password.length === 0) return errorResponse('password is required', 400)

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user) return errorResponse('Invalid email or password', 401)
    const valid = await comparePassword(password, user.passwordHash)
    if (!valid) return errorResponse('Invalid email or password', 401)

    const token = signToken({ userId: user.id, email: user.email, role: user.role, isOnboarding: user.isOnboarding })
    if (!token) return errorResponse('Authentication service unavailable', 503)

    // If approved user: set WORKING + create daily activity
    if (!user.isOnboarding) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      await Promise.all([
        prisma.user.update({ where: { id: user.id }, data: { currentStatus: 'WORKING' } }),
        prisma.dailyActivity.upsert({
          where: { userId_date: { userId: user.id, date: today } },
          update: { wasActive: true, lastSeenAt: new Date() },
          create: { userId: user.id, date: today, wasActive: true, lastSeenAt: new Date() },
        }),
      ])
    }

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'ADMIN' | 'EMPLOYEE',
      avatarUrl: user.avatarUrl,
      currentStatus: user.isOnboarding ? 'NOT_WORKING' : 'WORKING',
      isOnboarding: user.isOnboarding,
      createdAt: user.createdAt,
    }

    const response = successResponse(authUser)
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    })
    return response
  } catch (error) {
    console.error('[POST /api/auth/login]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
