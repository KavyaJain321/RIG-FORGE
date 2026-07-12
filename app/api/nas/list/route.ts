import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isNasEnabled, nasList } from '@/lib/nas/client'

// GET /api/nas/list?server=WD&path=/ — browse a NAS folder (Trijya only).
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)
  if (!isNasEnabled()) return errorResponse('NAS is not available', 403)

  const { searchParams } = new URL(request.url)
  const server = searchParams.get('server')
  const path = searchParams.get('path') || '/'
  if (!server) return errorResponse('server is required', 400)
  try {
    const data = await nasList(server, path)
    return successResponse(data)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'NAS list failed', 502)
  }
}
