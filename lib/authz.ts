/**
 * Privileged-action authentication that re-validates against the live DB row.
 *
 * The session JWT lasts 7 days and bakes in `role`, so trusting it alone means
 * a user who was deactivated or demoted keeps their old powers until the token
 * expires. For privileged WRITE endpoints (assistant action execution, user
 * management) we instead re-load `role` + `isActive` from the database on every
 * call, so revocation/demotion takes effect immediately.
 *
 * (A fuller fix — token versioning + refresh tokens — is tracked in
 * SECURITY_TODO.md; this closes the highest-risk write paths without a schema
 * change.)
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { resolveCapabilities } from '@/lib/permissions'

export interface ActiveCaller {
  userId: string
  role: string
}

export interface CapableCaller extends ActiveCaller {
  capabilities: Set<string>
}

/**
 * Returns the caller with their CURRENT role from the DB, or null if there's no
 * valid session or the account is inactive. Use on privileged write routes.
 */
export async function authenticateActive(request: NextRequest): Promise<ActiveCaller | null> {
  const token = getTokenFromCookies(request)
  if (!token) return null
  const claims = verifyToken(token)
  if (!claims) return null

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { role: true, isActive: true },
  })
  if (!user || !user.isActive) return null

  return { userId: claims.userId, role: user.role }
}

/**
 * Like authenticateActive, but also resolves the caller's fine-grained
 * capability set (from their assigned custom role, if any). Use on
 * capability-aware routes.
 */
export async function authenticateCapable(request: NextRequest): Promise<CapableCaller | null> {
  const token = getTokenFromCookies(request)
  if (!token) return null
  const claims = verifyToken(token)
  if (!claims) return null

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { role: true, isActive: true, customRole: { select: { permissions: true } } },
  })
  if (!user || !user.isActive) return null

  return {
    userId: claims.userId,
    role: user.role,
    capabilities: resolveCapabilities(user.role, user.customRole),
  }
}
