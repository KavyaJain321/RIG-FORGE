import { type NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, signToken, COOKIE_NAME } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { AuthUser } from '@/lib/types'

const MIN_PASSWORD_LENGTH = 8
const BCRYPT_ROUNDS = 12
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

// ─── PATCH /api/users/me/password ──────────────────────────────────────────
// Changes the current user's password.
// If mustChangePassword is true on the token, currentPassword is still required
// (it equals the temp password they were given). After success:
//   • passwordHash is updated
//   • tempPassword is cleared
//   • mustChangePassword is set to false
//   • A new JWT is issued so middleware stops redirecting to change-password

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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
      select: { id: true, name: true, email: true, role: true, avatarUrl: true,
                currentStatus: true, isOnboarding: true, passwordHash: true },
    })

    if (!user) return errorResponse('User not found', 404)

    // ── Verify current password ─────────────────────────────────────────
    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return errorResponse('Current password is incorrect', 401)

    // ── Hash and update ─────────────────────────────────────────────────
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        tempPassword: null,         // clear the temp password
        mustChangePassword: false,  // remove the forced-change flag
      },
    })

    // ── Issue a fresh JWT so mustChangePassword=false takes effect ──────
    const newToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      isOnboarding: user.isOnboarding,
      mustChangePassword: false,
    })

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as AuthUser['role'],
      avatarUrl: user.avatarUrl,
      currentStatus: user.currentStatus as AuthUser['currentStatus'],
      isOnboarding: user.isOnboarding,
      mustChangePassword: false,
      createdAt: new Date(),
    }

    const response = successResponse(authUser)
    if (newToken) {
      response.cookies.set(COOKIE_NAME, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      })
    }
    return response
  } catch (error) {
    console.error('[PATCH /api/users/me/password] Unexpected error:', error)
    return errorResponse('Internal server error', 500)
  }
}
