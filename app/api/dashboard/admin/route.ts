import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { AdminDashboardData } from '@/lib/types'

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Unauthorized', 401)

  const currentUser = verifyToken(token)
  if (!currentUser) return errorResponse('Unauthorized', 401)
  if (currentUser.role !== 'ADMIN') return errorResponse('Forbidden', 403)

  try {
    const [
      allUsers,
      openTicketsCount,
      activeProjects,
      workingMembers,
      recentOpenTickets,
      pendingOnboardingUsers,
    ] = await Promise.all([
      // memberStats: all non-onboarding users
      prisma.user.findMany({
        where: { isOnboarding: false },
        select: { id: true, currentStatus: true },
      }),

      // openTicketsCount
      prisma.ticket.count({ where: { status: 'OPEN' } }),

      // activeProjects with lead + task counts
      prisma.project.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          leadId: true,
          lead: { select: { name: true } },
          _count: { select: { members: true } },
          tasks: {
            where: { status: { not: 'DONE' } },
            select: { id: true },
          },
        },
      }),

      // workingMembers with primary project
      prisma.user.findMany({
        where: { currentStatus: 'WORKING', isOnboarding: false },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          currentStatus: true,
          dailyActivities: {
            orderBy: { lastSeenAt: 'desc' },
            take: 1,
            select: { lastSeenAt: true },
          },
          projects: {
            take: 1,
            select: {
              project: { select: { id: true, name: true } },
            },
          },
        },
      }),

      // recentOpenTickets: last 5 OPEN
      prisma.ticket.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          raisedBy: { select: { name: true } },
          project: { select: { name: true } },
        },
      }),

      // pendingOnboarding users
      prisma.user.findMany({
        where: { isOnboarding: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          _count: { select: { dailyActivities: true } },
        },
      }),
    ])

    const memberStats = {
      total: allUsers.length,
      working: allUsers.filter(u => u.currentStatus === 'WORKING').length,
      notWorking: allUsers.filter(u => u.currentStatus === 'NOT_WORKING').length,
    }

    const formattedActiveProjects: AdminDashboardData['activeProjects'] = activeProjects.map(p => ({
      id: p.id,
      name: p.name,
      memberCount: p._count.members,
      openTaskCount: p.tasks.length,
      leadName: p.lead?.name ?? null,
    }))

    const formattedWorkingMembers: AdminDashboardData['workingMembers'] = workingMembers.map(u => {
      const firstMembership = u.projects[0]
      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        currentStatus: u.currentStatus as 'WORKING' | 'NOT_WORKING',
        lastSeenAt: u.dailyActivities[0]?.lastSeenAt ?? null,
        primaryProject: firstMembership?.project.name ?? null,
        primaryProjectId: firstMembership?.project.id ?? null,
      }
    })

    const formattedRecentOpenTickets: AdminDashboardData['recentOpenTickets'] = recentOpenTickets.map(t => ({
      id: t.id,
      title: t.title,
      raisedByName: t.raisedBy.name,
      projectName: t.project.name,
      createdAt: t.createdAt,
    }))

    const formattedPendingOnboarding: AdminDashboardData['pendingOnboarding'] = pendingOnboardingUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      hasLoggedIn: u._count.dailyActivities > 0,
    }))

    const data: AdminDashboardData = {
      memberStats,
      openTicketsCount,
      activeProjects: formattedActiveProjects,
      workingMembers: formattedWorkingMembers,
      recentOpenTickets: formattedRecentOpenTickets,
      pendingOnboarding: formattedPendingOnboarding,
    }

    return successResponse(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
