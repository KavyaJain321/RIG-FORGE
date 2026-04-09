import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { EmployeeDashboardData } from '@/lib/types'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)

  const userId = currentUser.userId

  try {
    const now = new Date()

    const [
      myOpenTasksCount,
      myProjectsCount,
      myOpenTicketsCount,
      myProjectMemberships,
      myUpcomingTasks,
      myRecentTickets,
    ] = await Promise.all([
      // myOpenTasksCount
      prisma.task.count({
        where: {
          assigneeId: userId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
      }),

      // myProjectsCount
      prisma.projectMember.count({ where: { userId } }),

      // myOpenTicketsCount
      prisma.ticket.count({
        where: {
          raisedById: userId,
          status: { in: ['OPEN', 'ACCEPTED'] },
        },
      }),

      // myProjects
      prisma.projectMember.findMany({
        where: { userId },
        select: {
          project: {
            select: {
              id: true,
              name: true,
              status: true,
              leadId: true,
              tasks: {
                where: { assigneeId: userId },
                select: { id: true },
              },
            },
          },
        },
      }),

      // myUpcomingTasks: not DONE, ordered by dueDate asc, limit 5
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { not: 'DONE' },
        },
        orderBy: [{ dueDate: 'asc' }],
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          projectId: true,
          dueDate: true,
          project: { select: { name: true } },
        },
      }),

      // myRecentTickets: last 3
      prisma.ticket.findMany({
        where: { raisedById: userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          project: { select: { name: true } },
        },
      }),
    ])

    const formattedMyProjects: EmployeeDashboardData['myProjects'] = myProjectMemberships.map(pm => ({
      id: pm.project.id,
      name: pm.project.name,
      status: pm.project.status,
      isLead: pm.project.leadId === userId,
      myTaskCount: pm.project.tasks.length,
    }))

    const formattedMyUpcomingTasks: EmployeeDashboardData['myUpcomingTasks'] = myUpcomingTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      projectId: t.projectId,
      projectName: t.project.name,
      dueDate: t.dueDate,
      isOverdue: t.dueDate !== null && t.dueDate < now && t.status !== 'DONE',
    }))

    const formattedMyRecentTickets: EmployeeDashboardData['myRecentTickets'] = myRecentTickets.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      projectName: t.project.name,
      createdAt: t.createdAt,
    }))

    const data: EmployeeDashboardData = {
      myOpenTasksCount,
      myProjectsCount,
      myOpenTicketsCount,
      myProjects: formattedMyProjects,
      myUpcomingTasks: formattedMyUpcomingTasks,
      myRecentTickets: formattedMyRecentTickets,
    }

    return successResponse(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
