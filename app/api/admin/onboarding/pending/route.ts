import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload || !isAdminRole(payload.role)) return errorResponse('Admin access required', 403)

    const pendingUsers = await prisma.user.findMany({
      where: { isOnboarding: true },
      orderBy: { createdAt: 'desc' },
    })

    // Get latest DailyActivity for each pending user to see if they've logged in
    const userIds = pendingUsers.map((u) => u.id)
    const activities = await prisma.dailyActivity.findMany({
      where: { userId: { in: userIds } },
      orderBy: { lastSeenAt: 'desc' },
    })

    const activityMap = new Map<string, { lastSeenAt: Date | null }>()
    for (const a of activities) {
      if (!activityMap.has(a.userId)) {
        activityMap.set(a.userId, { lastSeenAt: a.lastSeenAt })
      }
    }

    const result = pendingUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      hasLoggedIn: activityMap.has(u.id),
      lastSeenAt: activityMap.get(u.id)?.lastSeenAt ?? null,
    }))

    return successResponse(result)
  } catch (error) {
    console.error('[GET /api/admin/onboarding/pending]', error)
    return errorResponse('Server error', 500)
  }
}
