import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { searchDrive, recentDriveFiles, isUserDriveEnabled } from '@/lib/assistant/tools/gdrive'
import { isGoogleReauthError } from '@/lib/google/oauth'

// GET /api/google/drive/list?q=...&limit=25 — recent files, or search when q is set.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserDriveEnabled(payload.userId))) return errorResponse('Drive not connected', 403)
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), 50)
    const result = q
      ? await searchDrive(payload.userId, { query: q, limit })
      : await recentDriveFiles(payload.userId, limit)
    return successResponse({ files: result.results })
  } catch (error) {
    if (isGoogleReauthError(error)) return errorResponse('Reconnect your Google account to use Drive.', 401)
    return errorResponse(error instanceof Error ? error.message : 'Failed to load Drive', 500)
  }
}
