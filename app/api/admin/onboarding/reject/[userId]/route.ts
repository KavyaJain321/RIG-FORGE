import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function DELETE(request: NextRequest, { params }: { params: { userId: string } }): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload || payload.role !== 'ADMIN') return errorResponse('Admin access required', 403)

    const { userId } = params
    const targetUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!targetUser) return errorResponse('User not found', 404)
    if (!targetUser.isOnboarding) return errorResponse('Cannot reject an approved user', 400)

    // Delete related records first (notifications, activities)
    await prisma.notification.deleteMany({ where: { userId } })
    await prisma.dailyActivity.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })

    return successResponse({ success: true })
  } catch (error) {
    console.error('[DELETE /api/admin/onboarding/reject]', error)
    return errorResponse('Server error', 500)
  }
}
