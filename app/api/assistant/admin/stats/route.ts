/**
 * GET /api/assistant/admin/stats
 *
 * Admin-only. Returns aggregate stats for the assistant:
 *   - totals: conversations, messages, audit-log entries
 *   - usage by user (top N by message count, last 7 days)
 *   - usage by provider (last 7 days)
 *   - recent audit log entries
 *
 * Used by the /dashboard/assistant page.
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { tokenCan } from '@/lib/permissions'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { RESERVATION_PROVIDER } from '@/lib/assistant/rate-limit'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)
  if (!tokenCan(claims, 'assistant.admin')) return errorResponse('Admin access required', 403)

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sevenDaysAgoDate = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate())

  // Parallelize the queries — each is independent
  const [
    totalConversations,
    totalMessages,
    totalAuditEntries,
    usageByUser,
    usageByProvider,
    recentAudit,
  ] = await Promise.all([
    prisma.assistantConversation.count(),
    prisma.assistantMessage.count(),
    prisma.assistantAuditLog.count(),

    // Last 7 days, top users by message count (exclude the reservation sentinel
    // so counts reflect real per-provider usage, not raw attempt reservations)
    prisma.assistantUsage.groupBy({
      by: ['userId'],
      where: { date: { gte: sevenDaysAgoDate }, provider: { not: RESERVATION_PROVIDER } },
      _sum: { messageCount: true, inputTokens: true, outputTokens: true },
      orderBy: { _sum: { messageCount: 'desc' } },
      take: 10,
    }),

    // Last 7 days, by provider (exclude the reservation sentinel)
    prisma.assistantUsage.groupBy({
      by: ['provider'],
      where: { date: { gte: sevenDaysAgoDate }, provider: { not: RESERVATION_PROVIDER } },
      _sum: { messageCount: true, inputTokens: true, outputTokens: true },
      orderBy: { _sum: { messageCount: 'desc' } },
    }),

    // Recent audit log entries
    prisma.assistantAuditLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    }),
  ])

  // Resolve user names for the top-users list
  const userIds = usageByUser.map((u) => u.userId)
  const userNames = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true },
  })
  const userMap = new Map(userNames.map((u) => [u.id, u]))

  return successResponse({
    totals: {
      conversations: totalConversations,
      messages: totalMessages,
      auditEntries: totalAuditEntries,
    },
    topUsers: usageByUser.map((u) => {
      const info = userMap.get(u.userId)
      return {
        userId: u.userId,
        name: info?.name ?? 'Unknown',
        role: info?.role ?? 'EMPLOYEE',
        messageCount: u._sum.messageCount ?? 0,
        inputTokens: u._sum.inputTokens ?? 0,
        outputTokens: u._sum.outputTokens ?? 0,
      }
    }),
    byProvider: usageByProvider.map((p) => ({
      provider: p.provider,
      messageCount: p._sum.messageCount ?? 0,
      inputTokens: p._sum.inputTokens ?? 0,
      outputTokens: p._sum.outputTokens ?? 0,
    })),
    recentAudit: recentAudit.map((r) => ({
      id: r.id,
      userName: r.user?.name ?? 'Unknown',
      action: r.action,
      success: r.success,
      error: r.error,
      createdAt: r.createdAt,
    })),
  })
}
