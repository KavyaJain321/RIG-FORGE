/**
 * GET  /api/assistant/daily-log-draft       — today's draft for the caller
 * POST /api/assistant/daily-log-draft       — approve or dismiss
 *
 * Approval converts the draft into a real DailyLog row (the same model
 * the rest of the app uses for log entries) and marks the draft APPROVED.
 * Dismiss just marks it DISMISSED so the user isn't nagged again today.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  const now = new Date()
  const dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const draft = await prisma.dailyLogDraft.findUnique({
    where: { userId_date: { userId: claims.userId, date: dateOnly } },
    select: {
      id: true,
      draftSummary: true,
      draftNotes: true,
      evidence: true,
      status: true,
      approvedAt: true,
      dismissedAt: true,
      createdDailyLogId: true,
      createdAt: true,
    },
  })

  return successResponse({ draft })
}

const Body = z.object({
  draftId: z.string().min(1),
  action: z.enum(['approve', 'dismiss']),
  editedSummary: z.string().min(1).max(2000).optional(),
  editedNotes: z.string().max(2000).optional(),
})

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  let raw: unknown
  try { raw = await request.json() } catch { return errorResponse('Invalid JSON', 400) }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid body', 400)

  const { draftId, action, editedSummary, editedNotes } = parsed.data

  const draft = await prisma.dailyLogDraft.findFirst({
    where: { id: draftId, userId: claims.userId },
  })
  if (!draft) return errorResponse('Draft not found', 404)
  if (draft.status !== 'PENDING') {
    return errorResponse(`Draft already ${draft.status.toLowerCase()}`, 400)
  }

  // ── Approve: create a DailyLog row, mark draft APPROVED ─────────────────
  if (action === 'approve') {
    const summary = editedSummary ?? draft.draftSummary
    const notes = editedNotes ?? draft.draftNotes ?? null

    try {
      // Upsert in case the user separately submitted a log today
      const dailyLog = await prisma.dailyLog.upsert({
        where: { userId_date: { userId: claims.userId, date: draft.date } },
        create: {
          userId: claims.userId,
          date: draft.date,
          workSummary: summary,
          notes,
        },
        update: { workSummary: summary, notes },
        select: { id: true },
      })

      await prisma.dailyLogDraft.update({
        where: { id: draft.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          createdDailyLogId: dailyLog.id,
          draftSummary: summary,
          draftNotes: notes,
        },
      })

      return successResponse({ approved: true, dailyLogId: dailyLog.id })
    } catch (err) {
      console.error('[daily-log-draft approve]', err)
      return errorResponse('Failed to approve draft', 500)
    }
  }

  // ── Dismiss ──────────────────────────────────────────────────────────────
  await prisma.dailyLogDraft.update({
    where: { id: draft.id },
    data: { status: 'DISMISSED', dismissedAt: new Date() },
  })
  return successResponse({ dismissed: true })
}
