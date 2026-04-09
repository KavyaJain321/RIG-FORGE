import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest, { params }: { params: { userId: string } }): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload || payload.role !== 'ADMIN') return errorResponse('Admin access required', 403)

    const { userId } = params
    const targetUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!targetUser) return errorResponse('User not found', 404)
    if (!targetUser.isOnboarding) return errorResponse('User is already approved', 400)

    let body: unknown
    try { body = await request.json() } catch { body = {} }
    const { projectIds } = (body as Record<string, unknown>)
    const ids: string[] = Array.isArray(projectIds) ? projectIds as string[] : []

    await prisma.user.update({ where: { id: userId }, data: { isOnboarding: false } })

    if (ids.length > 0) {
      await prisma.projectMember.createMany({
        data: ids.map((pid) => ({ userId, projectId: pid })),
        skipDuplicates: true,
      })
    }

    await prisma.notification.create({
      data: {
        userId,
        type: 'ONBOARDING_APPROVED',
        title: 'Account approved!',
        body: 'Your account has been approved. Welcome to FORGE!',
        linkTo: '/',
      },
    })

    return successResponse({ success: true })
  } catch (error) {
    console.error('[POST /api/admin/onboarding/approve]', error)
    return errorResponse('Server error', 500)
  }
}
