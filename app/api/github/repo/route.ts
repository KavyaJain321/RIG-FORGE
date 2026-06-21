import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listCommits, listPullRequests, listIssues, isGithubEnabled } from '@/lib/assistant/tools/github'

// GET /api/github/repo?repo=NAME&view=commits|prs|issues — repo detail for the Code panel.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)

  try {
    if (!isGithubEnabled()) return errorResponse('GitHub is not configured', 503)
    const url = new URL(request.url)
    const repo = url.searchParams.get('repo')
    const view = url.searchParams.get('view') ?? 'commits'
    if (!repo) return errorResponse('repo is required', 400)

    const items =
      view === 'prs'
        ? await listPullRequests({ repo, state: 'open', limit: 30 })
        : view === 'issues'
          ? await listIssues({ repo, state: 'open', limit: 30 })
          : await listCommits({ repo, limit: 30 })

    return successResponse({ view, items })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load repo', 500)
  }
}
