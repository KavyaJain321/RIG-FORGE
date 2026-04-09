import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, hashPassword } from '@/lib/auth'
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
  return password.split('').sort(() => crypto.randomBytes(1)[0] / 256 - 0.5).join('')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload || payload.role !== 'ADMIN') return errorResponse('Admin access required', 403)

    let body: unknown
    try { body = await request.json() } catch { return errorResponse('Invalid JSON', 400) }
    const { name, email, role } = body as Record<string, unknown>

    if (!name || typeof name !== 'string' || name.trim().length < 2) return errorResponse('Name is required (min 2 chars)', 400)
    if (!email || typeof email !== 'string' || !email.includes('@')) return errorResponse('Valid email is required', 400)
    if (!role || (role !== 'ADMIN' && role !== 'EMPLOYEE')) return errorResponse('Role must be ADMIN or EMPLOYEE', 400)

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
        isOnboarding: true,
        currentStatus: 'NOT_WORKING',
      },
    })

    // Notify all admins that a new user was created
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isOnboarding: false } })
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: 'ONBOARDING_PENDING' as const,
          title: 'New user created',
          body: `${name.trim()} (${normalizedEmail}) has been created and is awaiting approval.`,
          linkTo: '/dashboard/onboarding',
        })),
      })
    }

    return successResponse({ email: normalizedEmail, temporaryPassword }, 201)
  } catch (error) {
    console.error('[POST /api/admin/generate-user]', error)
    return errorResponse('Server error', 500)
  }
}
