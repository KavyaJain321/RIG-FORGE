import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isGithubEnabled } from '@/lib/assistant/tools/github'

// GET /api/github/status — whether GitHub is enabled for the caller's org.
// GitHub is owned by a single tenant (the credential-owning org); every other
// org (e.g. Trijya — architects, no GitHub) has it disabled. The Workspace UI
// uses this to hide the "Code" tab entirely rather than show an empty panel.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)
  return successResponse({ enabled: isGithubEnabled() })
}
