import { type NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, hashPassword, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '#$!@%&'
  const all = upper + lower + digits + symbols
  const bytes = crypto.randomBytes(16)
  let password = ''
  password += upper[bytes[0] % upper.length]
  password += lower[bytes[1] % lower.length]
  password += digits[bytes[2] % digits.length]
  password += symbols[bytes[3] % symbols.length]
  for (let i = 4; i < 16; i++) {
    password += all[bytes[i] % all.length]
  }
  return password.split('').sort(() => (crypto.randomBytes(1)[0] ?? 128) / 256 - 0.5).join('')
}

// ─── POST /api/admin/users/[id]/reset-password ───────────────────────────────
// Generates a new temp password for the target user and sets mustChangePassword=true.
//
// Access rules:
//  SUPER_ADMIN → can reset any user's password (ADMIN or EMPLOYEE)
//  ADMIN       → can only reset EMPLOYEE passwords (not other ADMINs)
//  Others      → 403

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)

    const caller = verifyToken(token)
    if (!caller || !isAdminRole(caller.role)) return errorResponse('Admin access required', 403)

    const { id: targetId } = params
    if (!targetId) return errorResponse('User ID is required', 400)

    // Fetch target user
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
    if (!target) return errorResponse('User not found', 404)
    if (!target.isActive) return errorResponse('Cannot reset password for deactivated user', 400)

    // ── Access control ────────────────────────────────────────────────────────
    // SUPER_ADMIN cannot have their password reset by anyone via this route
    if (target.role === 'SUPER_ADMIN') {
      return errorResponse('Super Admin password cannot be reset via this route', 403)
    }
    // ADMIN can only reset EMPLOYEE passwords
    if (caller.role === 'ADMIN' && target.role === 'ADMIN') {
      return errorResponse('Admins cannot reset other admin passwords', 403)
    }

    const newTempPassword = generateSecurePassword()
    const passwordHash = await hashPassword(newTempPassword)

    await prisma.user.update({
      where: { id: targetId },
      data: {
        passwordHash,
        tempPassword: newTempPassword,
        mustChangePassword: true,
      },
    })

    return successResponse({ temporaryPassword: newTempPassword })
  } catch (error) {
    console.error('[POST /api/admin/users/[id]/reset-password]', error)
    return errorResponse('Server error', 500)
  }
}
