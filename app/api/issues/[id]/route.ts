import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

const VALID_STATUS = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED']

// ─── PATCH /api/issues/[id] ───────────────────────────────────────────────────
// Any signed-in user may edit any issue in their org (title, description, status)
// — the issue log is collaborative, so anyone can refine or triage what others
// filed. Org-scoped so a caller can only touch issues in their own tenant.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => null)) as
      | { title?: unknown; description?: unknown; status?: unknown }
      | null
    if (!body || typeof body !== 'object') return errorResponse('Request body must be a JSON object', 400)

    const data: { title?: string; description?: string; status?: string } = {}

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length < 5) {
        return errorResponse('Title must be at least 5 characters', 400)
      }
      if (body.title.length > 150) return errorResponse('Title must not exceed 150 characters', 400)
      data.title = body.title.trim()
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string' || body.description.trim().length < 5) {
        return errorResponse('Description must be at least 5 characters', 400)
      }
      if (body.description.length > 4000) return errorResponse('Description must not exceed 4000 characters', 400)
      data.description = body.description.trim()
    }
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !VALID_STATUS.includes(body.status)) {
        return errorResponse('Invalid status', 400)
      }
      data.status = body.status
    }

    if (Object.keys(data).length === 0) return errorResponse('No valid fields provided', 400)

    // Org-scoped guard: only touch an issue in the caller's own tenant.
    const existing = await prisma.issue.findFirst({ where: { id: params.id }, select: { id: true } })
    if (!existing) return errorResponse('Issue not found', 404)

    await prisma.issue.update({ where: { id: params.id }, data: data as never })
    return successResponse({ id: params.id, ...data })
  } catch (error) {
    console.error('[PATCH /api/issues/[id]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
