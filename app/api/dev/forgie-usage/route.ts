/**
 * GET /api/dev/forgie-usage
 *
 * HIDDEN developer-only endpoint powering /dashboard/dev. Gated by the
 * DEV_DASHBOARD_EMAILS allowlist (NOT by role) — admins and the owner cannot
 * see it unless their email is listed.
 *
 * Returns one summary row per user: how much they've used Forgie on web and
 * WhatsApp, and how many write-actions Forgie executed for them. Full
 * transcripts are lazy-loaded per user via /api/dev/forgie-usage/[userId].
 */

import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken, isDeveloperEmail } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listInstances, getInstance, getInstanceClient } from '@/lib/dev/instances'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)
  if (!isDeveloperEmail(claims.email)) return errorResponse('Not found', 404)

  // Which company/instance are we inspecting? Defaults to the primary instance.
  const instanceId = new URL(request.url).searchParams.get('instance')
  const inst = getInstance(instanceId)
  if (!inst) return errorResponse('Unknown instance', 400)
  const db = getInstanceClient(inst)
  const instances = listInstances().map((i) => ({ id: i.id, label: i.label }))

  // These are UNSCOPED clients (see lib/dev/instances.ts), so when an instance
  // pins an org we filter explicitly — otherwise a shared schema would leak other
  // orgs' users into this company's view.
  const orgWhere = inst.organizationId ? { organizationId: inst.organizationId } : {}

  let users, convGroups, msgGroups, actionGroups
  try {
    ;[users, convGroups, msgGroups, actionGroups] = await Promise.all([
      db.user.findMany({
        where: orgWhere,
        select: { id: true, name: true, email: true, role: true, whatsappNumber: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      db.assistantConversation.groupBy({
        by: ['userId', 'channel'],
        where: orgWhere,
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      // Messages joined through conversation owner — count per (user, channel).
      db.assistantConversation.findMany({
        where: orgWhere,
        select: { userId: true, channel: true, _count: { select: { messages: true } } },
      }),
      db.assistantAuditLog.groupBy({
        by: ['userId'],
        where: orgWhere,
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ])
  } catch (error) {
    // Most likely the target company's schema doesn't exist in this deployment's
    // database (e.g. trijya isn't provisioned in prod). Surface it clearly rather
    // than 500-ing, and still return the instance list so the switcher works.
    return successResponse({
      users: [],
      instances,
      instance: inst.id,
      unavailable: true,
      reason: error instanceof Error ? error.message : 'Instance is not reachable',
    })
  }

  // Conversation counts + last-active per user/channel
  const webConvs = new Map<string, number>()
  const waConvs = new Map<string, number>()
  const lastActive = new Map<string, Date>()
  for (const g of convGroups) {
    const target = g.channel === 'WHATSAPP' ? waConvs : webConvs
    target.set(g.userId, g._count._all)
    const max = g._max.updatedAt
    if (max && (!lastActive.has(g.userId) || max > (lastActive.get(g.userId) as Date))) {
      lastActive.set(g.userId, max)
    }
  }

  // Message counts per user/channel
  const webMsgs = new Map<string, number>()
  const waMsgs = new Map<string, number>()
  for (const c of msgGroups) {
    const target = c.channel === 'WHATSAPP' ? waMsgs : webMsgs
    target.set(c.userId, (target.get(c.userId) ?? 0) + c._count.messages)
  }

  const actionCount = new Map<string, number>()
  for (const a of actionGroups) {
    actionCount.set(a.userId, a._count._all)
    const max = a._max.createdAt
    if (max && (!lastActive.has(a.userId) || max > (lastActive.get(a.userId) as Date))) {
      lastActive.set(a.userId, max)
    }
  }

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    whatsappNumber: u.whatsappNumber,
    isActive: u.isActive,
    webConversations: webConvs.get(u.id) ?? 0,
    waConversations: waConvs.get(u.id) ?? 0,
    webMessages: webMsgs.get(u.id) ?? 0,
    waMessages: waMsgs.get(u.id) ?? 0,
    actions: actionCount.get(u.id) ?? 0,
    lastActiveAt: lastActive.get(u.id) ?? null,
  }))

  // Most recently active first, but keep zero-activity users at the bottom.
  rows.sort((a, b) => {
    const ta = a.lastActiveAt ? a.lastActiveAt.getTime() : 0
    const tb = b.lastActiveAt ? b.lastActiveAt.getTime() : 0
    return tb - ta
  })

  return successResponse({ users: rows, instances, instance: inst.id })
}
