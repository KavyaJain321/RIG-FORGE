import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, hashPassword, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import crypto from 'crypto'

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '#$!@%&'
  const all = upper + lower + digits + symbols
  const bytes = crypto.randomBytes(16)
  let password = ''
  // Ensure at least one of each type
  password += upper[bytes[0] % upper.length]
  password += lower[bytes[1] % lower.length]
  password += digits[bytes[2] % digits.length]
  password += symbols[bytes[3] % symbols.length]
  for (let i = 4; i < 16; i++) {
    password += all[bytes[i] % all.length]
  }
  // Shuffle
  return password.split('').sort(() => (crypto.randomBytes(1)[0] ?? 128) / 256 - 0.5).join('')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload || !isAdminRole(payload.role)) return errorResponse('Admin access required', 403)

    let body: unknown
    try { body = await request.json() } catch { return errorResponse('Invalid JSON', 400) }
    const { name, email, role } = body as Record<string, unknown>

    if (!name || typeof name !== 'string' || name.trim().length < 2)
      return errorResponse('Name is required (min 2 chars)', 400)
    if (!email || typeof email !== 'string' || !email.includes('@'))
      return errorResponse('Valid email is required', 400)
    if (!role || !['ADMIN', 'EMPLOYEE'].includes(role as string))
      return errorResponse('Role must be ADMIN or EMPLOYEE', 400)

    // ── Role restriction: only SUPER_ADMIN can create ADMIN accounts ──────────
    if (role === 'ADMIN' && payload.role !== 'SUPER_ADMIN') {
      return errorResponse('Only Super Admin can create Admin accounts', 403)
    }

    // ── No one can create SUPER_ADMIN accounts via this route ─────────────────
    if (role === 'SUPER_ADMIN') {
      return errorResponse('Super Admin accounts cannot be created via this route', 403)
    }

    const normalizedEmail = email.toLowerCase().trim()
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) return errorResponse('Email already in use', 409)

    const temporaryPassword = generateSecurePassword()
    const passwordHash = await hashPassword(temporaryPassword)

    await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: role as 'ADMIN' | 'EMPLOYEE',
        isOnboarding: false,          // pre-approved — no approval step needed
        currentStatus: 'NOT_WORKING',
        tempPassword: temporaryPassword,  // stored so admins can retrieve it
        mustChangePassword: true,         // user must change on first login
      },
    })

    return successResponse({ email: normalizedEmail, temporaryPassword }, 201)
  } catch (error) {
    console.error('[POST /api/admin/generate-user]', error)
    return errorResponse('Server error', 500)
  }
}
