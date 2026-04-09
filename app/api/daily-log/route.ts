import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { DailyLogEntry } from '@/lib/types'

const MAX_WORK_SUMMARY_LENGTH = 2000

function getTodayUTC(): Date {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return today
}

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    const today = getTodayUTC()

    const log = await prisma.dailyLog.findUnique({
      where: {
        userId_date: {
          userId: payload.userId,
          date: today,
        },
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
  } catch (error) {
    console.error('[GET /api/daily-log] Unexpected error:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
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

    if (
      typeof body !== 'object' ||
      body === null ||
      !('workSummary' in body)
    ) {
      return errorResponse('workSummary is required', 400)
    }

    const { workSummary, notes } = body as { workSummary: unknown; notes?: unknown }

    if (typeof workSummary !== 'string' || workSummary.trim().length === 0) {
      return errorResponse('workSummary must be a non-empty string', 400)
    }

    if (workSummary.trim().length > MAX_WORK_SUMMARY_LENGTH) {
      return errorResponse(
        `workSummary must be ${MAX_WORK_SUMMARY_LENGTH} characters or fewer`,
        400
      )
    }

    const validatedNotes =
      notes !== undefined && notes !== null && typeof notes === 'string'
        ? notes
        : null

    const today = getTodayUTC()

    // Check for lock before upsert
    const existing = await prisma.dailyLog.findUnique({
      where: {
        userId_date: {
          userId: payload.userId,
          date: today,
        },
      },
      select: { isLocked: true },
    })

    if (existing?.isLocked) {
      return errorResponse('Log is locked', 403)
    }

    const log = await prisma.dailyLog.upsert({
      where: {
        userId_date: {
          userId: payload.userId,
          date: today,
        },
      },
      create: {
        userId: payload.userId,
        date: today,
        workSummary: workSummary.trim(),
        notes: validatedNotes,
        isLocked: false,
      },
      update: {
        workSummary: workSummary.trim(),
        notes: validatedNotes,
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
  } catch (error) {
    console.error('[POST /api/daily-log] Unexpected error:', error)
    return errorResponse('Internal server error', 500)
  }
}
