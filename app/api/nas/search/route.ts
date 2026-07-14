import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isNasEnabled, nasSearch, type NasSort } from '@/lib/nas/client'

// GET /api/nas/search?server=WD&q=plan — filename search on a NAS (Trijya only).
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)
  if (!isNasEnabled()) return errorResponse('NAS is not available', 403)

  const { searchParams } = new URL(request.url)
  const server = searchParams.get('server')
  const q = searchParams.get('q')
  const path = searchParams.get('path') || '/'
  const sortRaw = searchParams.get('sort') || 'relevance'
  const sort = (['relevance', 'latest', 'oldest', 'largest', 'name'] as const).includes(sortRaw as NasSort)
    ? (sortRaw as NasSort)
    : 'relevance'
  const since = Number(searchParams.get('since')) || undefined
  if (!server || !q) return errorResponse('server and q are required', 400)
  try {
    const data = await nasSearch(server, q, { path, sort, since })
    return successResponse(data)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'NAS search failed', 502)
  }
}
