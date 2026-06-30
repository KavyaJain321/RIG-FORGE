import { type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { signedUploadUrl, r2Configured } from '@/lib/storage/r2'
import { prisma } from '@/lib/db'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

// POST /api/chat/conversations/[id]/media/presign
// Body: { fileName, contentType, size } → { uploadUrl, key, proxyPath }
//
// Mints a short-lived signed PUT URL so the browser uploads the file DIRECTLY to
// our rf-media Worker (R2), bypassing the Next server entirely. We generate the
// object key here (after checking membership), so the client can only upload to a
// key scoped to this conversation.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    if (!r2Configured()) return errorResponse('Storage not configured', 500)

    const body = (await request.json().catch(() => null)) as
      | { fileName?: string; contentType?: string; size?: number }
      | null
    const fileName = body?.fileName?.trim()
    const contentType = body?.contentType?.trim() || 'application/octet-stream'
    const size = typeof body?.size === 'number' ? body.size : 0
    if (!fileName) return errorResponse('fileName is required', 400)
    if (size > MAX_BYTES) return errorResponse('File must be under 100MB', 400)

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: params.id, userId: payload.userId } },
      select: { id: true },
    })
    if (!member) return errorResponse('Not a member of this conversation', 403)

    const ext = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const key = `messages/${params.id}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
    const uploadUrl = signedUploadUrl(key)
    if (!uploadUrl) return errorResponse('Could not sign upload', 500)

    return successResponse({ uploadUrl, key, proxyPath: `/api/chat/media/${key}`, contentType })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return errorResponse(message, 500)
  }
}
