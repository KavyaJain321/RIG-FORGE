import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { DailyLogEntry } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns the Friday of the current ISO week (Mon–Sun) at UTC midnight.
// If today is Sat/Sun we still point at the Friday just passed, so employees
// always see/edit the note for the week that just ended or is in progress.
function getThisWeekFriday(): Date {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun, 1=Mon … 6=Sat
  // Days since Monday (treating Sunday as day 7 for ISO week calc)
  const daysSinceMon = day === 0 ? 6 : day - 1
  // Friday is Mon + 4
  const friday = new Date(now)
  friday.setUTCDate(now.getUTCDate() - daysSinceMon + 4)
  friday.setUTCHours(0, 0, 0, 0)
  return friday
}

// Marker stored in the `notes` column so we can distinguish weekly-note
// entries from regular daily logs that happen to fall on a Friday.
const WEEKLY_NOTE_MARKER = '__weekly_note__'

const MAX_LENGTH = 2000

// ─── GET /api/weekly-note ─────────────────────────────────────────────────────
// Returns the current user's weekly note for this ISO week, or null.

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    const friday = getThisWeekFriday()

    const log = await prisma.dailyLog.findFirst({
      where: {
        userId: payload.userId,
        date: friday,
        notes: WEEKLY_NOTE_MARKER,
      },
    })

    const result: DailyLogEntry | null = log
      ? {
          id: log.id,
          userId: log.userId,
          date: log.date,
          workSummary: log.workSummary,
          notes: log.notes,
          isLocked: log.isLocked,
          createdAt: log.createdAt,
          updatedAt: log.updatedAt,
        }
      : null

    return successResponse(result)
  } catch (err) {
    console.error('[GET /api/weekly-note]', err)
    return errorResponse('Internal server error', 500)
  }
}

// ─── POST /api/weekly-note ────────────────────────────────────────────────────
// Creates or updates the weekly note for the current ISO week.

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    if (typeof body !== 'object' || body === null || !('content' in body)) {
      return errorResponse('content is required', 400)
    }

    const { content } = body as { content: unknown }

    if (typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('content must be a non-empty string', 400)
    }

    if (content.trim().length > MAX_LENGTH) {
      return errorResponse(`content must be ${MAX_LENGTH} characters or fewer`, 400)
    }

    const friday = getThisWeekFriday()

    // Upsert: one entry per user per week (userId + date is unique in schema)
    const log = await prisma.dailyLog.upsert({
      where: {
        userId_date: {
          userId: payload.userId,
          date: friday,
        },
      },
      create: {
        userId: payload.userId,
        date: friday,
        workSummary: content.trim(),
        notes: WEEKLY_NOTE_MARKER,
        isLocked: false,
      },
      update: {
        workSummary: content.trim(),
        notes: WEEKLY_NOTE_MARKER,
      },
    })

    const result: DailyLogEntry = {
      id: log.id,
      userId: log.userId,
      date: log.date,
      workSummary: log.workSummary,
      notes: log.notes,
      isLocked: log.isLocked,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
    }

    return successResponse(result, 200)
  } catch (err) {
    console.error('[POST /api/weekly-note]', err)
    return errorResponse('Internal server error', 500)
  }
}
