import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { WeeklyReportSummary } from '@/lib/types'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)
  if (!isAdminRole(currentUser.role)) return errorResponse('Forbidden', 403)

  try {
    const reports = await prisma.weeklyReport.findMany({
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true,
        reportType: true,
        label: true,
        weekStart: true,
        weekEnd: true,
        generatedAt: true,
        generatedById: true,
        filterIds: true,
      },
    })

    const data: WeeklyReportSummary[] = reports.map((r) => ({
      id: r.id,
      reportType: r.reportType,
      label: r.label,
      weekStart: r.weekStart,
      weekEnd: r.weekEnd,
      generatedAt: r.generatedAt,
      generatedById: r.generatedById,
      filterIds: r.filterIds,
    }))

    return successResponse(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
