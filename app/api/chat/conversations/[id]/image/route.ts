import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { putObject, r2Configured } from '@/lib/storage/r2'
import { setGroupImage } from '@/lib/chat/service'

const MAX_BYTES = 5 * 1024 * 1024

// POST /api/chat/conversations/[id]/image — multipart upload of a group photo.
// Group photos are small, so they flow through the server to R2 (via the rf-media
// Worker), then we set the group's imageUrl (gates on admin + posts a system message).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return errorResponse('file is required (multipart form-data)', 400)
    if (!file.type.startsWith('image/')) return errorResponse('file must be an image', 400)
    if (file.size > MAX_BYTES) return errorResponse('image must be under 5MB', 400)

    if (!r2Configured()) return errorResponse('Storage not configured', 500)

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
    const key = `groups/${params.id}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const ok = await putObject(key, buffer, file.type)
    if (!ok) return errorResponse('Upload failed', 500)

    // Objects are private — store a stable authenticated-proxy path (not a public URL).
    const imageUrl = `/api/chat/media/${key}`

    // Gates on admin + persists + posts "changed the group photo".
    await setGroupImage(params.id, payload.userId, imageUrl)
    return successResponse({ imageUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    const status = /admin|Not a member/i.test(message) ? 403 : 500
    return errorResponse(message, status)
  }
}
