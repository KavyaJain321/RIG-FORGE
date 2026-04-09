import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { WeeklyReportSnapshot } from '@/lib/types'

interface WeeklyReportFull {
  id: string
  weekStart: Date
  weekEnd: Date
  generatedAt: Date
  snapshot: WeeklyReportSnapshot
}

// ─── GET /api/reports/[weekId] ────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { weekId: string } },
) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)
  if (currentUser.role !== 'ADMIN') return errorResponse('Forbidden', 403)

  const { weekId } = params

  try {
    const report = await prisma.weeklyReport.findUnique({
      where: { id: weekId },
    })

    if (!report) return errorResponse('Report not found', 404)

    const data: WeeklyReportFull = {
      id: report.id,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      generatedAt: report.generatedAt,
      snapshot: report.snapshot as unknown as WeeklyReportSnapshot,
    }

    return successResponse(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
