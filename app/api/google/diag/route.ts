/**
 * GET /api/google/diag — self-diagnostic for the CALLING user's own Google
 * connection. Returns scope + read COUNTS + any API error (no contact/mail
 * content). Lets us tell "empty account" apart from "read failing" without
 * server-log access. Safe: a user only sees their own connection.
 */
import { type NextRequest } from 'next/server'
import { google } from 'googleapis'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { getAuthorizedClient } from '@/lib/google/oauth'

async function tryCount(fn: () => Promise<number>): Promise<number | string> {
  try { return await fn() } catch (e) { return `ERROR: ${(e as Error).message?.slice(0, 160)}` }
}

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  const integ = await prisma.googleIntegration.findUnique({
    where: { userId: claims.userId },
    select: { email: true, scopes: true, connectedAt: true },
  })
  if (!integ) return successResponse({ connected: false })

  let auth
  try {
    auth = await getAuthorizedClient(claims.userId)
  } catch (e) {
    return successResponse({
      connected: true, email: integ.email, scopes: integ.scopes,
      authError: (e as Error).message?.slice(0, 160),
    })
  }

  const people = google.people({ version: 'v1', auth })
  const gmail = google.gmail({ version: 'v1', auth })

  const [connections, otherContacts, inbox] = await Promise.all([
    tryCount(async () => (await people.people.connections.list({ resourceName: 'people/me', personFields: 'names', pageSize: 5 })).data.connections?.length ?? 0),
    tryCount(async () => (await people.otherContacts.list({ readMask: 'names,emailAddresses', pageSize: 5 })).data.otherContacts?.length ?? 0),
    tryCount(async () => (await gmail.users.messages.list({ userId: 'me', labelIds: ['INBOX'], maxResults: 5 })).data.messages?.length ?? 0),
  ])

  return successResponse({
    connected: true,
    email: integ.email,
    connectedAt: integ.connectedAt,
    scopes: integ.scopes,
    reads: { connections, otherContacts, inbox },
  })
}
