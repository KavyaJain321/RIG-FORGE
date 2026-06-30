import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { sendMediaMessage } from '@/lib/chat/service'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

// POST /api/chat/conversations/[id]/media
// Body: { key, fileName, fileSize, contentType }
//
// COMMIT step. The file has already been uploaded directly to R2 via a presigned
// PUT (see ./presign). This just records the message pointing at the stable proxy
// path. We validate the key is scoped to this conversation so a member can't attach
// media from another thread.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const body = (await request.json().catch(() => null)) as
      | { key?: string; fileName?: string; fileSize?: number; contentType?: string }
      | null
    const key = body?.key?.trim()
    const fileName = body?.fileName?.trim() || 'file'
    const fileSize = typeof body?.fileSize === 'number' ? body.fileSize : undefined
    const contentType = body?.contentType || 'application/octet-stream'

    if (!key) return errorResponse('key is required', 400)
    if (!key.startsWith(`messages/${params.id}/`)) return errorResponse('Invalid media key', 400)
    if (fileSize !== undefined && fileSize > MAX_BYTES) return errorResponse('File must be under 100MB', 400)

    const mediaType = contentType.startsWith('image/')
      ? 'IMAGE'
      : contentType.startsWith('audio/')
        ? 'AUDIO'
        : 'FILE'
    const proxyPath = `/api/chat/media/${key}`

    // sendMediaMessage re-checks membership.
    const message = await sendMediaMessage(params.id, payload.userId, mediaType, proxyPath, fileName, fileSize)
    return successResponse({ message })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    const status = /Not a member/i.test(message) ? 403 : 500
    return errorResponse(message, status)
  }
}
