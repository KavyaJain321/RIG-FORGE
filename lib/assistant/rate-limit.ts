/**
 * Per-user soft rate limiting for Forgie.
 *
 * Strategy: simple per-hour message count, stored in AssistantUsage table.
 * "Soft" = if limit is hit we return a friendly message, not an error.
 *
 * The limit is configurable via ASSISTANT_USER_MSG_PER_HOUR. Defaults to 30
 * which is plenty for normal usage (a heavy user might ask 10-15 questions
 * in an hour; the limit catches abuse or runaway loops).
 */

import { prisma } from '@/lib/db'

const DEFAULT_LIMIT = 30

export interface RateLimitResult {
  allowed: boolean
  count: number
  limit: number
  resetInMinutes: number
}

function getLimit(): number {
  const raw = process.env.ASSISTANT_USER_MSG_PER_HOUR
  if (!raw) return DEFAULT_LIMIT
  const n = parseInt(raw, 10)
  return Number.isNaN(n) || n < 1 ? DEFAULT_LIMIT : n
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const limit = getLimit()
  const now = new Date()
  const dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hour = now.getHours()

  // Sum messageCount for this user in the current hour across all providers
  const rows = await prisma.assistantUsage.findMany({
    where: { userId, date: dateOnly, hour },
    select: { messageCount: true },
  })

  const count = rows.reduce((acc, r) => acc + r.messageCount, 0)
  const minutesElapsed = now.getMinutes()
  const resetInMinutes = 60 - minutesElapsed

  return {
    allowed: count < limit,
    count,
    limit,
    resetInMinutes,
  }
}

export async function recordUsage(args: {
  userId: string
  provider: string
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  const now = new Date()
  const dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hour = now.getHours()

  await prisma.assistantUsage.upsert({
    where: {
      userId_date_hour_provider: {
        userId: args.userId,
        date: dateOnly,
        hour,
        provider: args.provider,
      },
    },
    create: {
      userId: args.userId,
      date: dateOnly,
      hour,
      provider: args.provider,
      messageCount: 1,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    },
    update: {
      messageCount: { increment: 1 },
      inputTokens: { increment: args.inputTokens },
      outputTokens: { increment: args.outputTokens },
    },
  })
}
