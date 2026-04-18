import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { WeeklyReportSnapshot, WeeklyReportEmployeeSnapshot, WeeklyReportProjectSnapshot } from '@/lib/types'

// ─── POST /api/reports/generate ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)
  if (!isAdminRole(currentUser.role)) return errorResponse('Forbidden', 403)

  try {
    // ── 1. Calculate last full week (Mon–Sun) ─────────────────────────────────
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysToMonday - 7)
    weekStart.setUTCHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setUTCHours(23, 59, 59, 999)

    // ── 2. Idempotency check ──────────────────────────────────────────────────
    const existing = await prisma.weeklyReport.findFirst({
      where: {
        weekStart: {
          gte: weekStart,
          lte: new Date(weekStart.getTime() + 86400000),
        },
      },
    })
    if (existing) return successResponse(existing)

    // ── 3. Fetch all active users ─────────────────────────────────────────────
    const users = await prisma.user.findMany({
      where: { isOnboarding: false },
    })

    const nowDate = new Date()

    // ── 4. Build per-employee snapshots in parallel ───────────────────────────
    const employeeSnapshots: WeeklyReportEmployeeSnapshot[] = await Promise.all(
      users.map(async (user) => {
        const [
          activities,
          dailyLogs,
          tasksCompleted,
          tasksInProgress,
          overdueCount,
          ticketsRaisedCount,
          ticketsHelpedCount,
        ] = await Promise.all([
          prisma.dailyActivity.findMany({
            where: {
              userId: user.id,
              date: { gte: weekStart, lte: weekEnd },
              wasActive: true,
            },
          }),
          prisma.dailyLog.findMany({
            where: {
              userId: user.id,
              date: { gte: weekStart, lte: weekEnd },
            },
            orderBy: { date: 'asc' },
          }),
          prisma.task.findMany({
            where: {
              assigneeId: user.id,
              status: 'DONE',
              completedAt: { gte: weekStart, lte: weekEnd },
            },
            include: { project: { select: { name: true } } },
          }),
          prisma.task.findMany({
            where: {
              assigneeId: user.id,
              status: { in: ['TODO', 'IN_PROGRESS'] },
            },
            include: { project: { select: { name: true } } },
          }),
          prisma.task.count({
            where: {
              assigneeId: user.id,
              status: { not: 'DONE' },
              dueDate: { lt: nowDate },
            },
          }),
          prisma.ticket.count({
            where: {
              raisedById: user.id,
              createdAt: { gte: weekStart, lte: weekEnd },
            },
          }),
          prisma.ticket.count({
            where: {
              helperId: user.id,
              completedAt: { gte: weekStart, lte: weekEnd },
            },
          }),
        ])

        const activeDays = activities.map((a) =>
          new Date(a.date).toISOString().split('T')[0],
        )

        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          daysActive: activities.length,
          activeDays,
          tasksCompleted: tasksCompleted.map((t) => ({
            id: t.id,
            title: t.title,
            projectName: t.project.name,
            completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : '',
          })),
          tasksInProgress: tasksInProgress.map((t) => ({
            id: t.id,
            title: t.title,
            projectName: t.project.name,
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          })),
          overdueTasksCount: overdueCount,
          ticketsRaised: ticketsRaisedCount,
          ticketsHelped: ticketsHelpedCount,
          dailyLogs: dailyLogs.map((l) => ({
            date: new Date(l.date).toISOString().split('T')[0],
            workSummary: l.workSummary,
            notes: l.notes ?? null,
          })),
        }
      }),
    )

    // ── 5. Build project snapshots ────────────────────────────────────────────
    const allProjects = await prisma.project.findMany({
      include: {
        lead: { select: { name: true } },
        _count: { select: { members: true } },
        tasks: {
          select: {
            status: true,
            dueDate: true,
            completedAt: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    })

    const projectSnapshots: WeeklyReportProjectSnapshot[] = allProjects.map((p) => {
      const tasksTotal      = p.tasks.length
      const tasksCompleted  = p.tasks.filter((t) => t.status === 'DONE').length
      const tasksInProgress = p.tasks.filter((t) => t.status === 'IN_PROGRESS').length
      const tasksOverdue    = p.tasks.filter(
        (t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < nowDate,
      ).length
      const completedThisWeek = p.tasks.filter(
        (t) =>
          t.status === 'DONE' &&
          t.completedAt &&
          new Date(t.completedAt) >= weekStart &&
          new Date(t.completedAt) <= weekEnd,
      ).length

      return {
        projectId:        p.id,
        name:             p.name,
        status:           p.status,
        leadName:         p.lead?.name ?? null,
        memberCount:      p._count.members,
        tasksTotal,
        tasksCompleted,
        tasksInProgress,
        tasksOverdue,
        completedThisWeek,
      }
    })

    // ── 6. Build company stats ────────────────────────────────────────────────
    const totalDaysActive = employeeSnapshots.reduce((sum, e) => sum + e.daysActive, 0)
    const totalTasksCompleted = employeeSnapshots.reduce((sum, e) => sum + e.tasksCompleted.length, 0)
    const totalTicketsRaised = employeeSnapshots.reduce((sum, e) => sum + e.ticketsRaised, 0)
    const totalTicketsResolved = employeeSnapshots.reduce((sum, e) => sum + e.ticketsHelped, 0)
    const activeProjects = projectSnapshots.filter((p) => p.status === 'ACTIVE').length

    const snapshot: WeeklyReportSnapshot = {
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      companyStats: {
        totalEmployees: users.length,
        totalDaysActive,
        totalTasksCompleted,
        totalTicketsRaised,
        totalTicketsResolved,
        activeProjects,
      },
      projects: projectSnapshots,
      employees: employeeSnapshots,
    }

    // ── 6. Persist ────────────────────────────────────────────────────────────
    const report = await prisma.weeklyReport.create({
      data: {
        weekStart,
        weekEnd,
        generatedAt: nowDate,
        snapshot: snapshot as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    })

    return successResponse(report, 201)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
