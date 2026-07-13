import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isNasEnabled } from '@/lib/nas/client'
import { signShareToken } from '@/lib/nas/share-token'

// POST /api/nas/share  { server, path, ttlDays? } — mint a signed, time-limited
// link to one NAS file that works WITHOUT a session (share over WhatsApp/email).
export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)
  if (!isNasEnabled()) return errorResponse('NAS is not available', 403)

  let body: { server?: string; path?: string; ttlDays?: number }
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON', 400)
  }
  const { server, path } = body
  if (!server || !path) return errorResponse('server and path are required', 400)
  const ttlDays = Math.min(Math.max(Number(body.ttlDays) || 7, 1), 30)

  try {
    const shareToken = signShareToken(server, path, ttlDays * 24 * 3600)
    // Relative path — the client prepends its own public origin.
    return successResponse({ path: `/api/nas/shared?token=${encodeURIComponent(shareToken)}`, ttlDays })
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Failed to create link', 500)
  }
}
