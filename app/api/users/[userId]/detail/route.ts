import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { MemberDetail } from '@/lib/types'

// ─── GET /api/users/[userId]/detail ─────────────────────────────────────────
// Admin-only. Returns full MemberDetail for a given user.

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } },
): Promise<Response> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)
    if (payload.role !== 'ADMIN') return errorResponse('Admin access required', 403)

    const { userId } = params

    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Run all queries in parallel
    const [
      userRecord,
      projectMembers,
      dailyActivities,
      dailyLogs,
      completedTasks,
      activeTasks,
      ticketsRaisedCount,
      ticketsHelpedCount,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatarUrl: true,
          currentStatus: true,
          isOnboarding: true,
          createdAt: true,
        },
      }),
      prisma.projectMember.findMany({
        where: { userId },
        select: {
          joinedAt: true,
          project: {
            select: { id: true, name: true, status: true, leadId: true },
          },
        },
      }),
      prisma.dailyActivity.findMany({
        where: {
          userId,
          date: { gte: sevenDaysAgo, lte: now },
        },
        select: { date: true, wasActive: true, lastSeenAt: true },
        orderBy: { date: 'desc' },
      }),
      prisma.dailyLog.findMany({
        where: {
          userId,
          date: { gte: sevenDaysAgo, lte: now },
        },
        select: { date: true, workSummary: true, notes: true },
        orderBy: { date: 'asc' },
      }),
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: 'DONE',
          completedAt: { gte: sevenDaysAgo },
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          completedAt: true,
          project: { select: { name: true } },
        },
      }),
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          dueDate: true,
          project: { select: { name: true } },
        },
      }),
      prisma.ticket.count({ where: { raisedById: userId } }),
      prisma.ticket.count({ where: { helperId: userId } }),
    ])

    if (!userRecord) return errorResponse('User not found', 404)

    // Derive lastSeenAt from most recent DailyActivity record
    const lastSeenAt = dailyActivities[0]?.lastSeenAt ?? null

    // Build activityThisWeek — oldest to newest (7 days ending today)
    const activityMap = new Map<string, boolean>()
    for (const record of dailyActivities) {
      const key = record.date.toISOString().slice(0, 10)
      activityMap.set(key, record.wasActive)
    }

    const activityThisWeek = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - i))
      const key = d.toISOString().slice(0, 10)
      return { date: key, wasActive: activityMap.get(key) ?? false }
    })

    const projects = projectMembers.map((pm) => ({
      id: pm.project.id,
      name: pm.project.name,
      status: pm.project.status as string,
      isLead: pm.project.leadId === userId,
      joinedAt: pm.joinedAt,
    }))

    const completedTasksThisWeek = completedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project.name,
      completedAt: t.completedAt as Date,
    }))

    const inProgressTasks = activeTasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project.name,
      dueDate: t.dueDate,
      isOverdue: t.dueDate !== null && t.dueDate < now,
    }))

    const dailyLogsThisWeek = dailyLogs.map((log) => ({
      date: log.date.toISOString().slice(0, 10),
      workSummary: log.workSummary,
      notes: log.notes,
    }))

    const detail: MemberDetail = {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      role: userRecord.role,
      avatarUrl: userRecord.avatarUrl,
      currentStatus: userRecord.currentStatus,
      lastSeenAt,
      isOnboarding: userRecord.isOnboarding,
      createdAt: userRecord.createdAt,
      projects,
      activityThisWeek,
      completedTasksThisWeek,
      inProgressTasks,
      ticketsRaisedCount,
      ticketsHelpedCount,
      dailyLogsThisWeek,
    }

    return successResponse(detail)
  } catch (err) {
    console.error('[GET /api/users/[userId]/detail]', err)
    return errorResponse('An unexpected error occurred', 500)
  }
}
