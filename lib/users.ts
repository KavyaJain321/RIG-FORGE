import type { User } from '@prisma/client'

import type { AuthUser } from '@/lib/types'

/**
 * Converts a full Prisma User record to AuthUser.
 * passwordHash is structurally excluded — it never appears in any response.
 * Every route that returns a user MUST go through this function.
 */
export function extractAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as AuthUser['role'],
    avatarUrl: user.avatarUrl,
    currentStatus: user.currentStatus as AuthUser['currentStatus'],
    isOnboarding: user.isOnboarding,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  }
}
