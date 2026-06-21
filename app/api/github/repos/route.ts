import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listRepos, isGithubEnabled } from '@/lib/assistant/tools/github'

// GET /api/github/repos — org repositories (shared org token, any authed user).
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)

  try {
    if (!isGithubEnabled()) return errorResponse('GitHub is not configured', 503)
    const repos = await listRepos({ limit: 50, sort: 'pushed' })
    return successResponse({ repos })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load repos', 500)
  }
}
