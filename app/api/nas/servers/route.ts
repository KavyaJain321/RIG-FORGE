import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isNasEnabled, nasServers } from '@/lib/nas/client'

// GET /api/nas/servers — list configured NAS units (Trijya only). Also the
// signal the Workspace uses to decide whether to show the Files tab.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)
  if (!isNasEnabled()) return successResponse({ enabled: false, servers: [] })
  try {
    const servers = await nasServers()
    return successResponse({ enabled: true, servers })
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'NAS unavailable', 502)
  }
}
