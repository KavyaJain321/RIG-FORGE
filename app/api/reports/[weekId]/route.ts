import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// ─── GET /api/reports/[weekId] ────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { weekId: string } },
) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)
  if (!isAdminRole(currentUser.role)) return errorResponse('Forbidden', 403)

  const { weekId } = params

  try {
    const report = await prisma.weeklyReport.findUnique({ where: { id: weekId } })
    if (!report) return errorResponse('Report not found', 404)

    return successResponse({
      id:            report.id,
      reportType:    report.reportType,
      label:         report.label,
      weekStart:     report.weekStart,
      weekEnd:       report.weekEnd,
      generatedAt:   report.generatedAt,
      generatedById: report.generatedById,
      filterIds:     report.filterIds,
      snapshot:      report.snapshot,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}

// ─── DELETE /api/reports/[weekId] ─────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: { weekId: string } },
) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)
  if (!isAdminRole(currentUser.role)) return errorResponse('Forbidden', 403)

  const { weekId } = params

  try {
    const report = await prisma.weeklyReport.findUnique({ where: { id: weekId } })
    if (!report) return errorResponse('Report not found', 404)

    await prisma.weeklyReport.delete({ where: { id: weekId } })
    return successResponse({ deleted: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
