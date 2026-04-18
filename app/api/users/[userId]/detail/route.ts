import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { MemberDetail } from '@/lib/types'

// ─── GET /api/users/[userId]/detail ─────────────────────────────────────────
// ADMIN: returns full MemberDetail for any user.
// EMPLOYEE: can ONLY fetch their own profile — 403 for anyone else.
// This is the hard privacy wall. The frontend also guards, but the API is authoritative.

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } },
): Promise<Response> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    const { userId } = params
    const isAdmin = isAdminRole(payload.role)
    const isSuperAdmin = payload.role === 'SUPER_ADMIN'
    const isOwnProfile = payload.userId === userId

    // EMPLOYEE attempting to view another user's profile → hard deny
    if (!isAdmin && !isOwnProfile) {
      return errorResponse('Forbidden', 403)
    }

    // Both ADMIN and own-profile always get full data

    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Base queries always needed
    const baseQueries = [
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
          // Only expose temp password fields to admin viewers
          ...(isAdmin && { tempPassword: true, mustChangePassword: true }),
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
    ] as const

    // Full queries — only for admin or own profile
    const needsFull = isAdmin || isOwnProfile

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
      ...baseQueries,
      needsFull
        ? prisma.dailyLog.findMany({
            where: { userId, date: { gte: sevenDaysAgo, lte: now } },
            select: { date: true, workSummary: true, notes: true },
            orderBy: { date: 'asc' },
          })
        : Promise.resolve([]),
      needsFull
        ? prisma.task.findMany({
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
          })
        : Promise.resolve([]),
      needsFull
        ? prisma.task.findMany({
            where: {
              assigneeId: userId,
              status: { in: ['TODO', 'IN_PROGRESS'] },
            },
            select: {
              id: true,
              title: true,
              priority: true,
              projectId: true,
              dueDate: true,
              project: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      needsFull ? prisma.ticket.count({ where: { raisedById: userId } }) : Promise.resolve(0),
      needsFull ? prisma.ticket.count({ where: { helperId: userId } }) : Promise.resolve(0),
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

    // Task counts per project for this user
    const projectIds = projectMembers.map((pm) => pm.project.id)
    const [taskCountsRaw, doneTaskCountsRaw] = await Promise.all([
      projectIds.length > 0
        ? prisma.task.groupBy({
            by: ['projectId'],
            where: { assigneeId: userId, projectId: { in: projectIds } },
            _count: { id: true },
          })
        : Promise.resolve([]),
      projectIds.length > 0
        ? prisma.task.groupBy({
            by: ['projectId'],
            where: { assigneeId: userId, projectId: { in: projectIds }, status: 'DONE' },
            _count: { id: true },
          })
        : Promise.resolve([]),
    ])

    const taskCountMap = new Map<string, number>()
    for (const row of taskCountsRaw) taskCountMap.set(row.projectId, row._count.id)
    const doneTaskCountMap = new Map<string, number>()
    for (const row of doneTaskCountsRaw) doneTaskCountMap.set(row.projectId, row._count.id)

    const projects = projectMembers.map((pm) => ({
      id: pm.project.id,
      name: pm.project.name,
      status: pm.project.status as string,
      isLead: pm.project.leadId === userId,
      joinedAt: pm.joinedAt,
      myTaskCount: taskCountMap.get(pm.project.id) ?? 0,
      myDoneTaskCount: doneTaskCountMap.get(pm.project.id) ?? 0,
    }))

    const completedTasksThisWeek = (completedTasks as {
      id: string; title: string; projectId: string; completedAt: Date | null;
      project: { name: string }
    }[]).map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project.name,
      completedAt: t.completedAt as Date,
    }))

    const inProgressTasks = (activeTasks as {
      id: string; title: string; priority: string; projectId: string;
      dueDate: Date | null; project: { name: string }
    }[]).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      projectId: t.projectId,
      projectName: t.project.name,
      dueDate: t.dueDate,
      isOverdue: t.dueDate !== null && t.dueDate < now,
    }))

    const dailyLogsThisWeek = (dailyLogs as {
      date: Date; workSummary: string; notes: string | null
    }[]).map((log) => ({
      date: log.date.toISOString().slice(0, 10),
      workSummary: log.workSummary,
      notes: log.notes,
    }))

    const typedUserRecord = userRecord as typeof userRecord & {
      tempPassword?: string | null
      mustChangePassword?: boolean
    }

    // ADMIN cannot see SUPER_ADMIN's temp password (nobody can reset superadmin)
    const canSeeTempPassword = isAdmin && typedUserRecord.role !== 'SUPER_ADMIN' &&
      (isSuperAdmin || typedUserRecord.role === 'EMPLOYEE')

    const detail: MemberDetail = {
      id: typedUserRecord.id,
      name: typedUserRecord.name,
      email: typedUserRecord.email,
      role: typedUserRecord.role as MemberDetail['role'],
      avatarUrl: typedUserRecord.avatarUrl,
      currentStatus: typedUserRecord.currentStatus as MemberDetail['currentStatus'],
      lastSeenAt,
      isOnboarding: typedUserRecord.isOnboarding,
      createdAt: typedUserRecord.createdAt,
      projects,
      activityThisWeek,
      completedTasksThisWeek,
      inProgressTasks,
      ticketsRaisedCount,
      ticketsHelpedCount,
      dailyLogsThisWeek,
      ...(isAdmin && {
        mustChangePassword: typedUserRecord.mustChangePassword ?? false,
        tempPassword: canSeeTempPassword ? (typedUserRecord.tempPassword ?? null) : null,
      }),
    }

    return successResponse(detail)
  } catch (err) {
    console.error('[GET /api/users/[userId]/detail]', err)
    return errorResponse('An unexpected error occurred', 500)
  }
}
