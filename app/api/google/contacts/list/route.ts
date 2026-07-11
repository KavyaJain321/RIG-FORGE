import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listContacts, searchContacts, isUserContactsEnabled } from '@/lib/assistant/tools/gcontacts'
import { isGoogleReauthError } from '@/lib/google/oauth'

// GET /api/google/contacts/list?q=...&limit=50 — contacts, or search when q is set.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserContactsEnabled(payload.userId))) return errorResponse('Contacts not connected', 403)
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100)
    const result = q
      ? await searchContacts(payload.userId, q, Math.min(limit, 30))
      : await listContacts(payload.userId, limit)
    return successResponse({ contacts: result.contacts })
  } catch (error) {
    if (isGoogleReauthError(error)) return errorResponse('Reconnect your Google account to use Contacts.', 401)
    return errorResponse(error instanceof Error ? error.message : 'Failed to load Contacts', 500)
  }
}
