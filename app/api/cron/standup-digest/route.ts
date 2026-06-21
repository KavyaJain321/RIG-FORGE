/**
 * POST /api/cron/standup-digest
 *
 * Cron-driven. Run at ~9am IST daily.
 * Generates today's standup digest (one row per day) and persists it
 * to StandupDigest. Visible on /dashboard as a card.
 *
 * Idempotent: same-day re-runs replace the existing row (upsert).
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isCronAuthorized } from '@/lib/cron'
import { buildStandupMetrics, generateStandupDigest } from '@/lib/assistant/standup-digest'
import { forgieDmToUser } from '@/lib/chat/service'

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return errorResponse('Unauthorized', 401)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  try {
    const metrics = await buildStandupMetrics()
    const digest = await generateStandupDigest(metrics)
    if (!digest) {
      return errorResponse('Failed to generate digest — all LLM providers exhausted', 503)
    }

    const row = await prisma.standupDigest.upsert({
      where: { date: today },
      create: {
        date: today,
        summary: digest,
        metrics: metrics as unknown as object,
      },
      update: {
        summary: digest,
        metrics: metrics as unknown as object,
        generatedAt: new Date(),
      },
    })

    // Deliver the digest into each active member's Forgie chat (nudge-into-chat).
    const members = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } })
    const delivered = await Promise.allSettled(
      members.map((u) => forgieDmToUser(u.id, `📋 Today's standup digest\n\n${digest}`)),
    )
    const sent = delivered.filter((r) => r.status === 'fulfilled').length

    return successResponse({
      digestId: row.id,
      date: row.date,
      length: digest.length,
      forgieChatsNotified: sent,
    })
  } catch (err) {
    console.error('[cron/standup-digest]', err)
    return errorResponse('Failed to build digest', 500)
  }
}
