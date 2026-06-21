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

// Builds the "work only" matchers from the active roster:
//   - company domains (e.g. rigforge.com) → match the whole domain
//   - teammates' personal addresses on free-mail providers → match the exact address
// The CURRENT user's own addresses are excluded — otherwise "to:me" would match
// their entire inbox and filter nothing.
async function teamFilter(currentUserId: string): Promise<{ domains: string[]; addresses: string[] }> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, personalEmail: true },
  })
  const me = users.find((u) => u.id === currentUserId)
  const mine = new Set([me?.email, me?.personalEmail].map((e) => e?.toLowerCase().trim()).filter(Boolean) as string[])

  const domains = new Set<string>()
  const addresses = new Set<string>()
  for (const u of users) {
    for (const e of [u.email, u.personalEmail]) {
      const addr = e?.toLowerCase().trim()
      if (!addr || !addr.includes('@')) continue
      const domain = addr.split('@')[1]
      if (FREE_MAIL.has(domain)) {
        if (!mine.has(addr)) addresses.add(addr)
      } else {
        domains.add(domain)
      }
    }
  }
  return { domains: [...domains], addresses: [...addresses].slice(0, 60) }
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
    let clauseCount = 0
    if (explicitQ) {
      query = explicitQ
    } else if (scope === 'work') {
      const { domains, addresses } = await teamFilter(payload.userId)
      const clauses = [
        ...domains.flatMap((d) => [`from:${d}`, `to:${d}`, `cc:${d}`]),
        ...addresses.flatMap((a) => [`from:${a}`, `to:${a}`, `cc:${a}`]),
      ]
      clauseCount = clauses.length
      query = clauses.length ? `in:inbox {${clauses.join(' ')}}` : 'in:inbox'
    } else {
      query = 'in:inbox'
    }

    const result = await searchMessages(payload.userId, { query, limit })
    return successResponse({ ...result, scope, filtered: scope === 'work' && clauseCount > 0 })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load mail', 500)
  }
}
