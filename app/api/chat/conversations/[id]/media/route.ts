import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { sendMediaMessage } from '@/lib/chat/service'

const BUCKET = 'chat-media'
const MAX_BYTES = 5 * 1024 * 1024

// POST /api/chat/conversations/[id]/media — multipart image upload → creates an
// IMAGE message whose content is the public URL. (Documents/video later.)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return errorResponse('file is required (multipart form-data)', 400)
    if (!file.type.startsWith('image/')) return errorResponse('only images are supported for now', 400)
    if (file.size > MAX_BYTES) return errorResponse('image must be under 5MB', 400)

    const admin = getSupabaseAdmin()
    if (!admin) return errorResponse('Storage not configured', 500)

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
    const path = `messages/${params.id}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true })
    if (upErr) return errorResponse(`Upload failed: ${upErr.message}`, 500)

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    const message = await sendMediaMessage(params.id, payload.userId, 'IMAGE', data.publicUrl)
    return successResponse({ message })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    const status = /Not a member/i.test(message) ? 403 : 500
    return errorResponse(message, status)
  }
}
