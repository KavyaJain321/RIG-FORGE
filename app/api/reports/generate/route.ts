import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type {
  WeeklyReportSnapshot,
  WeeklyReportEmployeeSnapshot,
  WeeklyReportProjectSnapshot,
  ProjectReportSnapshot,
  ProjectReportProjectEntry,
  EmployeeReportSnapshot,
  EmployeeReportEntry,
} from '@/lib/types'

// ─── Label builder ────────────────────────────────────────────────────────────

function buildLabel(
  type: string,
  dateFrom: Date,
  dateTo: Date,
  names: string[],
): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const range = `${fmt(dateFrom)} – ${fmt(dateTo)}`
  const nameStr =
    names.length <= 2
      ? names.join(', ')
      : `${names.slice(0, 2).join(', ')} (+${names.length - 2} more)`

  if (type === 'PROJECT')  return `Project Report · ${range} · ${nameStr}`
  if (type === 'EMPLOYEE') return `Employee Report · ${range} · ${nameStr}`
  return `Weekly Report · ${range}`
}

// ─── POST /api/reports/generate ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)
  if (!isAdminRole(currentUser.role)) return errorResponse('Forbidden', 403)

  let body: {
    type?: string
    dateFrom?: string
    dateTo?: string
    filterIds?: string[]
  } = {}
  try { body = await request.json() } catch { /* no body = WEEKLY */ }

  const reportType = body.type ?? 'WEEKLY'
  const now = new Date()

  // ── WEEKLY (legacy behaviour) ─────────────────────────────────────────────
  if (reportType === 'WEEKLY') {
    return generateWeekly(currentUser.userId, now)
  }

  // ── PROJECT or EMPLOYEE: require dates + filterIds ────────────────────────
  if (!body.dateFrom || !body.dateTo) {
    return errorResponse('dateFrom and dateTo are required', 400)
  }
  if (!body.filterIds || body.filterIds.length === 0) {
    return errorResponse('Select at least one item', 400)
  }

  const dateFrom = new Date(body.dateFrom)
  dateFrom.setUTCHours(0, 0, 0, 0)
  const dateTo = new Date(body.dateTo)
  dateTo.setUTCHours(23, 59, 59, 999)

  if (reportType === 'PROJECT') {
    return generateProjectReport(currentUser.userId, dateFrom, dateTo, body.filterIds, now)
  }
  if (reportType === 'EMPLOYEE') {
    return generateEmployeeReport(currentUser.userId, dateFrom, dateTo, body.filterIds, now)
  }

  return errorResponse('Invalid report type', 400)
}

// ─── WEEKLY generator ─────────────────────────────────────────────────────────

async function generateWeekly(generatedById: string, now: Date) {
  try {
    const dayOfWeek = now.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysToMonday - 7)
    weekStart.setUTCHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setUTCHours(23, 59, 59, 999)

    const existing = await prisma.weeklyReport.findFirst({
      where: { reportType: 'WEEKLY', weekStart: { gte: weekStart, lte: new Date(weekStart.getTime() + 86400000) } },
    })
    if (existing) return successResponse(existing)

    const users = await prisma.user.findMany({ where: { isOnboarding: false } })
    const employeeSnapshots = await buildEmployeeSnapshots(users, weekStart, weekEnd, now)
    const allProjects = await prisma.project.findMany({
      include: { lead: { select: { name: true } }, _count: { select: { members: true } }, tasks: { select: { status: true, dueDate: true, completedAt: true } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    })
    const projectSnapshots: WeeklyReportProjectSnapshot[] = allProjects.map((p) => buildWeeklyProjectRow(p, weekStart, weekEnd, now))
    const snapshot: WeeklyReportSnapshot = {
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd:   weekEnd.toISOString().split('T')[0],
      companyStats: {
        totalEmployees:      users.length,
        totalDaysActive:     employeeSnapshots.reduce((s, e) => s + e.daysActive, 0),
        totalTasksCompleted: employeeSnapshots.reduce((s, e) => s + e.tasksCompleted.length, 0),
        totalTicketsRaised:  employeeSnapshots.reduce((s, e) => s + e.ticketsRaised, 0),
        totalTicketsResolved:employeeSnapshots.reduce((s, e) => s + e.ticketsHelped, 0),
        activeProjects:      allProjects.filter((p) => p.status === 'ACTIVE').length,
      },
      projects:  projectSnapshots,
      employees: employeeSnapshots,
    }
    const label = buildLabel('WEEKLY', weekStart, weekEnd, [])
    const report = await prisma.weeklyReport.create({
      data: { reportType: 'WEEKLY', label, weekStart, weekEnd, generatedAt: now, generatedById, filterIds: [], snapshot: snapshot as object },
    })
    return successResponse(report, 201)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Internal server error', 500)
  }
}

// ─── PROJECT Report generator ─────────────────────────────────────────────────

async function generateProjectReport(
  generatedById: string,
  dateFrom: Date,
  dateTo: Date,
  projectIds: string[],
  now: Date,
) {
  try {
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: {
        lead:    { select: { name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        tasks: {
          include: { assignee: { select: { id: true, name: true } } },
        },
        tickets: {
          where: { createdAt: { gte: dateFrom, lte: dateTo } },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const projectEntries: ProjectReportProjectEntry[] = projects.map((p) => {
      const allTasks       = p.tasks
      const completedTotal = allTasks.filter((t) => t.status === 'DONE').length
      const inProgress     = allTasks.filter((t) => t.status === 'IN_PROGRESS').length
      const overdue        = allTasks.filter((t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < now).length
      const completedInRange = allTasks.filter(
        (t) => t.status === 'DONE' && t.completedAt && new Date(t.completedAt) >= dateFrom && new Date(t.completedAt) <= dateTo,
      ).length

      // member stats
      const memberMap = new Map<string, { name: string; done: number; inProg: number }>()
      for (const t of allTasks) {
        if (!t.assignee) continue
        const entry = memberMap.get(t.assignee.id) ?? { name: t.assignee.name, done: 0, inProg: 0 }
        if (t.status === 'DONE') entry.done++
        else if (t.status === 'IN_PROGRESS') entry.inProg++
        memberMap.set(t.assignee.id, entry)
      }

      return {
        projectId:   p.id,
        name:        p.name,
        status:      p.status,
        leadName:    p.lead?.name ?? null,
        memberCount: p.members.length,
        tasks: {
          total:            allTasks.length,
          completed:        completedTotal,
          inProgress,
          overdue,
          completedInRange,
        },
        members: [...memberMap.entries()].map(([userId, v]) => ({
          userId,
          name:            v.name,
          tasksCompleted:  v.done,
          tasksInProgress: v.inProg,
        })),
        ticketsInRange: p.tickets.length,
      }
    })

    const snapshot: ProjectReportSnapshot = {
      type: 'PROJECT',
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo:   dateTo.toISOString().split('T')[0],
      projects: projectEntries,
    }

    const label = buildLabel('PROJECT', dateFrom, dateTo, projects.map((p) => p.name))
    const report = await prisma.weeklyReport.create({
      data: {
        reportType: 'PROJECT', label,
        weekStart: dateFrom, weekEnd: dateTo,
        generatedAt: now, generatedById,
        filterIds: projectIds,
        snapshot: snapshot as object,
      },
    })
    return successResponse(report, 201)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Internal server error', 500)
  }
}

// ─── EMPLOYEE Report generator ────────────────────────────────────────────────

async function generateEmployeeReport(
  generatedById: string,
  dateFrom: Date,
  dateTo: Date,
  userIds: string[],
  now: Date,
) {
  try {
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } })
    const employeeEntries: EmployeeReportEntry[] = await Promise.all(
      users.map(async (user) => {
        const [activities, dailyLogs, tasksCompleted, tasksInProgress, overdueCount, ticketsRaised, ticketsHelped] =
          await Promise.all([
            prisma.dailyActivity.findMany({ where: { userId: user.id, date: { gte: dateFrom, lte: dateTo }, wasActive: true } }),
            prisma.dailyLog.findMany({ where: { userId: user.id, date: { gte: dateFrom, lte: dateTo } }, orderBy: { date: 'asc' } }),
            prisma.task.findMany({
              where: { assigneeId: user.id, status: 'DONE', completedAt: { gte: dateFrom, lte: dateTo } },
              include: { project: { select: { id: true, name: true } } },
            }),
            prisma.task.findMany({
              where: { assigneeId: user.id, status: { in: ['TODO', 'IN_PROGRESS'] } },
              include: { project: { select: { id: true, name: true } } },
            }),
            prisma.task.count({ where: { assigneeId: user.id, status: { not: 'DONE' }, dueDate: { lt: now } } }),
            prisma.ticket.count({ where: { raisedById: user.id, createdAt: { gte: dateFrom, lte: dateTo } } }),
            prisma.ticket.count({ where: { helperId: user.id, completedAt: { gte: dateFrom, lte: dateTo } } }),
          ])

        // build project contribution map
        const projMap = new Map<string, { name: string; done: number }>()
        for (const t of tasksCompleted) {
          const e = projMap.get(t.project.id) ?? { name: t.project.name, done: 0 }
          e.done++
          projMap.set(t.project.id, e)
        }

        return {
          userId:   user.id,
          name:     user.name,
          email:    user.email,
          role:     user.role,
          daysActive: activities.length,
          activeDays: activities.map((a) => new Date(a.date).toISOString().split('T')[0]),
          projects: [...projMap.entries()].map(([id, v]) => ({ id, name: v.name, tasksCompleted: v.done })),
          tasksCompleted: tasksCompleted.map((t) => ({
            id: t.id, title: t.title,
            projectName: t.project.name,
            completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : '',
          })),
          tasksInProgress: tasksInProgress.map((t) => ({
            id: t.id, title: t.title,
            projectName: t.project.name,
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          })),
          overdueTasksCount: overdueCount,
          ticketsRaised:  ticketsRaised,
          ticketsHelped:  ticketsHelped,
          dailyLogs: dailyLogs.map((l) => ({
            date: new Date(l.date).toISOString().split('T')[0],
            workSummary: l.workSummary,
            notes: l.notes ?? null,
          })),
        }
      }),
    )

    const snapshot: EmployeeReportSnapshot = {
      type: 'EMPLOYEE',
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo:   dateTo.toISOString().split('T')[0],
      employees: employeeEntries,
    }

    const label = buildLabel('EMPLOYEE', dateFrom, dateTo, users.map((u) => u.name))
    const report = await prisma.weeklyReport.create({
      data: {
        reportType: 'EMPLOYEE', label,
        weekStart: dateFrom, weekEnd: dateTo,
        generatedAt: now, generatedById,
        filterIds: userIds,
        snapshot: snapshot as object,
      },
    })
    return successResponse(report, 201)
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Internal server error', 500)
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function buildEmployeeSnapshots(
  users: { id: string; name: string; email: string; role: string }[],
  weekStart: Date,
  weekEnd: Date,
  now: Date,
): Promise<WeeklyReportEmployeeSnapshot[]> {
  return Promise.all(
    users.map(async (user) => {
      const [activities, dailyLogs, tasksCompleted, tasksInProgress, overdueCount, ticketsRaised, ticketsHelped] =
        await Promise.all([
          prisma.dailyActivity.findMany({ where: { userId: user.id, date: { gte: weekStart, lte: weekEnd }, wasActive: true } }),
          prisma.dailyLog.findMany({ where: { userId: user.id, date: { gte: weekStart, lte: weekEnd } }, orderBy: { date: 'asc' } }),
          prisma.task.findMany({ where: { assigneeId: user.id, status: 'DONE', completedAt: { gte: weekStart, lte: weekEnd } }, include: { project: { select: { name: true } } } }),
          prisma.task.findMany({ where: { assigneeId: user.id, status: { in: ['TODO', 'IN_PROGRESS'] } }, include: { project: { select: { name: true } } } }),
          prisma.task.count({ where: { assigneeId: user.id, status: { not: 'DONE' }, dueDate: { lt: now } } }),
          prisma.ticket.count({ where: { raisedById: user.id, createdAt: { gte: weekStart, lte: weekEnd } } }),
          prisma.ticket.count({ where: { helperId: user.id, completedAt: { gte: weekStart, lte: weekEnd } } }),
        ])
      return {
        userId: user.id, name: user.name, email: user.email, role: user.role,
        daysActive: activities.length,
        activeDays: activities.map((a) => new Date(a.date).toISOString().split('T')[0]),
        tasksCompleted: tasksCompleted.map((t) => ({ id: t.id, title: t.title, projectName: t.project.name, completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : '' })),
        tasksInProgress: tasksInProgress.map((t) => ({ id: t.id, title: t.title, projectName: t.project.name, dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null })),
        overdueTasksCount: overdueCount, ticketsRaised, ticketsHelped,
        dailyLogs: dailyLogs.map((l) => ({ date: new Date(l.date).toISOString().split('T')[0], workSummary: l.workSummary, notes: l.notes ?? null })),
      }
    }),
  )
}

function buildWeeklyProjectRow(
  p: {
    id: string; name: string; status: string;
    lead: { name: string } | null;
    _count: { members: number };
    tasks: { status: string; dueDate: Date | null; completedAt: Date | null }[];
  },
  weekStart: Date,
  weekEnd: Date,
  now: Date,
): WeeklyReportProjectSnapshot {
  return {
    projectId:       p.id,
    name:            p.name,
    status:          p.status,
    leadName:        p.lead?.name ?? null,
    memberCount:     p._count.members,
    tasksTotal:      p.tasks.length,
    tasksCompleted:  p.tasks.filter((t) => t.status === 'DONE').length,
    tasksInProgress: p.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    tasksOverdue:    p.tasks.filter((t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < now).length,
    completedThisWeek: p.tasks.filter((t) => t.status === 'DONE' && t.completedAt && new Date(t.completedAt) >= weekStart && new Date(t.completedAt) <= weekEnd).length,
  }
}
