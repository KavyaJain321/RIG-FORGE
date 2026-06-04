import { type NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

/**
 * DELETE /api/users/[userId]
 *
 * Soft-deactivates a user (sets isActive = false). Login already rejects
 * inactive users, and all list endpoints filter by isActive: true, so a
 * deactivated user disappears from the platform while their task/ticket
 * history stays intact.
 *
 * Permission matrix (mirrors the existing tempPassword visibility rules):
 *   - ADMIN may remove EMPLOYEE only.
 *   - SUPER_ADMIN may remove EMPLOYEE or ADMIN.
 *   - No one may remove a SUPER_ADMIN.
 *   - No one may remove themselves.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } },
): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    if (!isAdminRole(payload.role)) {
      return errorResponse('Only admins can remove members', 403)
    }
    const callerIsSuperAdmin = payload.role === 'SUPER_ADMIN'

    const { userId } = params
    if (userId === payload.userId) {
      return errorResponse('You cannot remove your own account', 400)
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, name: true },
    })
    if (!target) return errorResponse('User not found', 404)
    if (!target.isActive) return errorResponse('User is already deactivated', 400)

    // SUPER_ADMIN is untouchable.
    if (target.role === 'SUPER_ADMIN') {
      return errorResponse('Super admins cannot be removed', 403)
    }
    // Only SUPER_ADMIN can remove an ADMIN.
    if (target.role === 'ADMIN' && !callerIsSuperAdmin) {
      return errorResponse('Only super admins can remove other admins', 403)
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false, currentStatus: 'NOT_WORKING' },
    })

    return successResponse({ id: userId, name: target.name })
  } catch (error) {
    console.error('[DELETE /api/users/[userId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
