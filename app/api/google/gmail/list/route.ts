import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { searchMessages, isUserGmailEnabled } from '@/lib/assistant/tools/gmail'

// Personal-mail providers — never treated as "team" domains, so a teammate whose
// login email happens to be gmail.com doesn't drag all of gmail into the filter.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com',
  'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com',
])

// Distinct company domains across the active roster — drives the "work only" view.
async function teamDomains(): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { email: true, personalEmail: true } })
  const set = new Set<string>()
  for (const u of users) {
    for (const e of [u.email, u.personalEmail]) {
      const d = e?.split('@')[1]?.toLowerCase().trim()
      if (d && !FREE_MAIL.has(d)) set.add(d)
    }
  }
  return [...set]
}

// GET /api/google/gmail/list?scope=work|all&limit=25[&q=...]
// scope=work (default) → only mail involving the team/company domains.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGmailEnabled(payload.userId))) return errorResponse('Gmail not connected', 403)
    const url = new URL(request.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), 50)
    const explicitQ = url.searchParams.get('q')
    const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'work'

    let query: string
    let domains: string[] = []
    if (explicitQ) {
      query = explicitQ
    } else if (scope === 'work') {
      domains = await teamDomains()
      query = domains.length
        ? `in:inbox {${domains.flatMap((d) => [`from:${d}`, `to:${d}`, `cc:${d}`]).join(' ')}}`
        : 'in:inbox'
    } else {
      query = 'in:inbox'
    }

    const result = await searchMessages(payload.userId, { query, limit })
    // No company domains on the roster → "work" can't filter; tell the client so it can note it.
    return successResponse({ ...result, scope, filtered: scope === 'work' && domains.length > 0, domains })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load mail', 500)
  }
}
