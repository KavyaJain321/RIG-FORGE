import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { DailyLogEntry } from '@/lib/types'

const WEEK_LOG_LIMIT = 7

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    const { userId } = params

    if (!userId || userId.trim().length === 0) {
      return errorResponse('userId parameter is required', 400)
    }

    if (userId !== payload.userId && payload.role !== 'ADMIN') {
      return errorResponse('Forbidden: insufficient permissions', 403)
    }

    const logs = await prisma.dailyLog.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: WEEK_LOG_LIMIT,
    })

    const result: DailyLogEntry[] = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      date: log.date,
      workSummary: log.workSummary,
      notes: log.notes,
      isLocked: log.isLocked,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
    }))

    return successResponse(result)
  } catch (error) {
    console.error(`[GET /api/daily-log/${params.userId}/week] Unexpected error:`, error)
    return errorResponse('Internal server error', 500)
  }
}
