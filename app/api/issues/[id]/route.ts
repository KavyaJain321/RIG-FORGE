import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { tokenCan } from '@/lib/permissions'
import { successResponse, errorResponse } from '@/lib/api-helpers'

const VALID_STATUS = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED']

// ─── PATCH /api/issues/[id] ───────────────────────────────────────────────────
// Admin-only: update an issue's status.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    if (!tokenCan(payload, 'members.view')) return errorResponse('Admin access required', 403)

    const body = (await request.json().catch(() => null)) as { status?: unknown } | null
    const status = typeof body?.status === 'string' ? body.status : ''
    if (!VALID_STATUS.includes(status)) return errorResponse('Invalid status', 400)

    // Org-scoped guard: only touch an issue in the caller's own tenant.
    const existing = await prisma.issue.findFirst({ where: { id: params.id }, select: { id: true } })
    if (!existing) return errorResponse('Issue not found', 404)

    await prisma.issue.update({ where: { id: params.id }, data: { status: status as never } })
    return successResponse({ id: params.id, status })
  } catch (error) {
    console.error('[PATCH /api/issues/[id]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
