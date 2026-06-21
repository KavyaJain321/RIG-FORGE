import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { addGroupMembers, removeGroupMember, setMemberRole } from '@/lib/chat/service'

function statusFor(message: string): number {
  return /admin|Not a member|owner/i.test(message) ? 403 : 400
}

async function auth(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return null
  return verifyToken(token)
}

// POST   — add members:    { userIds: string[] }
// DELETE — remove member:  { userId: string }
// PATCH  — set role:       { userId: string, role: "ADMIN" | "MEMBER" }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await auth(request)
    if (!payload) return errorResponse('Authentication required', 401)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const userIds = Array.isArray(body.userIds) ? body.userIds.filter((x): x is string => typeof x === 'string') : []
    if (userIds.length === 0) return errorResponse('userIds must be a non-empty array', 400)
    await addGroupMembers(params.id, payload.userId, userIds)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, statusFor(message))
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await auth(request)
    if (!payload) return errorResponse('Authentication required', 401)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.userId !== 'string') return errorResponse('userId is required', 400)
    await removeGroupMember(params.id, payload.userId, body.userId)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, statusFor(message))
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await auth(request)
    if (!payload) return errorResponse('Authentication required', 401)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.userId !== 'string') return errorResponse('userId is required', 400)
    if (body.role !== 'ADMIN' && body.role !== 'MEMBER') return errorResponse('role must be ADMIN or MEMBER', 400)
    await setMemberRole(params.id, payload.userId, body.userId, body.role)
    return successResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, statusFor(message))
  }
}
