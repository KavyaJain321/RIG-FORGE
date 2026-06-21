/**
 * POST /api/cron/daily-log-drafts
 *
 * Cron-driven. Run at ~6pm IST daily.
 *
 * For every active employee who:
 *   - has activity today AND
 *   - hasn't already submitted a daily log for today AND
 *   - doesn't already have a draft for today
 *
 * we draft their daily log via the LLM and persist it as a DailyLogDraft.
 * The user sees it in their dashboard (or via notification) and approves
 * with one tap.
 *
 * Returns: { processed, drafted, skipped, errors }.
 *
 * Idempotent: re-runs on the same day skip users who already have a
 * draft, so accidentally triggering twice doesn't double-draft.
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isCronAuthorized } from '@/lib/cron'
import { istDateOnly } from '@/lib/date-ist'
import {
  collectActivity,
  draftLogForActivity,
} from '@/lib/assistant/daily-log-draft'
import { forgieDmToUser } from '@/lib/chat/service'

interface Counters {
  processed: number
  drafted: number
  skipped: number
  errors: number
  errorDetails: string[]
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return errorResponse('Unauthorized', 401)

  const dateOnly = istDateOnly()

  // All employees + admins eligible: active, onboarded, not in must-change-password
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      isOnboarding: false,
      mustChangePassword: false,
    },
    select: { id: true, name: true },
  })

  const counters: Counters = {
    processed: 0,
    drafted: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
  }

  for (const user of users) {
    counters.processed += 1

    try {
      // Skip if already submitted today
      const existingLog = await prisma.dailyLog.findUnique({
        where: { userId_date: { userId: user.id, date: dateOnly } },
        select: { id: true },
      })
      if (existingLog) {
        counters.skipped += 1
        continue
      }

      // Skip if already drafted today
      const existingDraft = await prisma.dailyLogDraft.findUnique({
        where: { userId_date: { userId: user.id, date: dateOnly } },
        select: { id: true },
      })
      if (existingDraft) {
        counters.skipped += 1
        continue
      }

      // Collect activity — skip if nothing observed
      const activity = await collectActivity(user.id, dateOnly)
      if (!activity) {
        counters.skipped += 1
        continue
      }

      // Draft
      const { summary } = await draftLogForActivity(user.name, activity)
      if (!summary) {
        counters.errors += 1
        counters.errorDetails.push(`${user.name}: LLM returned empty draft`)
        continue
      }

      await prisma.dailyLogDraft.create({
        data: {
          userId: user.id,
          date: dateOnly,
          draftSummary: summary,
          evidence: activity as unknown as object,
        },
      })

      // In-app notification so they see it
      await prisma.notification
        .create({
          data: {
            userId: user.id,
            type: 'ADMIN_MESSAGE',
            title: 'Daily log drafted',
            body: 'Forgie drafted your daily log from what you did today. Open the dashboard to approve or edit.',
            linkTo: '/dashboard',
          },
        })
        .catch(() => {})

      // Nudge them in their Forgie chat too.
      await forgieDmToUser(
        user.id,
        '📝 I drafted your daily log for today from your activity. Review & approve it on your dashboard.',
      ).catch(() => {})

      counters.drafted += 1
    } catch (err) {
      counters.errors += 1
      counters.errorDetails.push(
        `${user.name}: ${err instanceof Error ? err.message : 'unknown'}`,
      )
    }
  }

  return successResponse(counters)
}
