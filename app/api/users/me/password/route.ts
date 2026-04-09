import { type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

const MIN_PASSWORD_LENGTH = 8
const BCRYPT_ROUNDS = 12

// ─── PATCH /api/users/me/password ──────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired token', 401)

    // ── Parse body ──────────────────────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !('currentPassword' in body) ||
      !('newPassword' in body)
    ) {
      return errorResponse('currentPassword and newPassword are required', 400)
    }

    // ── confirmPassword must be present and match ───────────────────────────
    if (!('confirmPassword' in body)) {
      return errorResponse('confirmPassword is required', 400)
    }

    const { currentPassword, newPassword, confirmPassword } = body as Record<string, unknown>

    if (typeof currentPassword !== 'string' || currentPassword.trim() === '') {
      return errorResponse('currentPassword is required', 400)
    }

    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return errorResponse(
        `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters`,
        400
      )
    }

    if (typeof confirmPassword !== 'string' || confirmPassword !== newPassword) {
      return errorResponse('Passwords do not match', 400)
    }

    // ── Fetch user ──────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, passwordHash: true },
    })

    if (!user) return errorResponse('User not found', 404)

    // ── Verify current password ─────────────────────────────────────────
    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return errorResponse('Current password is incorrect', 401)

    // ── Hash and update ─────────────────────────────────────────────────
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    })

    return successResponse({ success: true })
  } catch (error) {
    console.error('[PATCH /api/users/me/password] Unexpected error:', error)
    return errorResponse('Internal server error', 500)
  }
}
