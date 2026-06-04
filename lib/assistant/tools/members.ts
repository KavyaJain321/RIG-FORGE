/**
 * Forgie tools — team member queries.
 *
 * Both employees and admins can browse the team directory, but
 * employees only see public-ish fields (name, role, avatar, current status).
 * Admins additionally see email, isActive, onboarding state.
 */

import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import type { ToolUser } from './projects'

export interface ListMembersArgs {
  search?: string         // partial name match
  projectId?: string      // only members of this project
  role?: 'ADMIN' | 'EMPLOYEE' | 'SUPER_ADMIN'
  status?: 'WORKING' | 'NOT_WORKING'
  limit?: number
}

export async function listMembers(caller: ToolUser, args: ListMembersArgs = {}) {
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100)
  const isAdmin = isAdminRole(caller.role)

  const where: Prisma.UserWhereInput = {
    isActive: true,
    isOnboarding: false,
    ...(args.search && {
      name: { contains: args.search, mode: 'insensitive' },
    }),
    ...(args.role && { role: args.role }),
    ...(args.status && { currentStatus: args.status }),
    ...(args.projectId && {
      projects: { some: { projectId: args.projectId } },
    }),
  }

  const users = await prisma.user.findMany({
    where,
    take: limit,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      role: true,
      avatarUrl: true,
      currentStatus: true,
      // admin-only fields:
      ...(isAdmin && { email: true, createdAt: true }),
      _count: { select: { projects: true, tasks: true } },
    },
  })

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    avatarUrl: u.avatarUrl,
    currentStatus: u.currentStatus,
    projectCount: u._count.projects,
    taskCount: u._count.tasks,
    ...(isAdmin && { email: (u as { email?: string }).email }),
  }))
}

// ─── get_member ──────────────────────────────────────────────────────────────

export async function getMember(caller: ToolUser, userIdOrName: string) {
  const isAdmin = isAdminRole(caller.role)

  // Resolve by id OR exact-ish name match
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [
        { id: userIdOrName },
        { name: { equals: userIdOrName, mode: 'insensitive' } },
        { name: { contains: userIdOrName, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      role: true,
      avatarUrl: true,
      currentStatus: true,
      ...(isAdmin && { email: true }),
      projects: {
        select: {
          project: {
            select: { id: true, name: true, status: true },
          },
        },
      },
      projectsLed: {
        where: { isActive: true },
        select: { id: true, name: true, status: true },
      },
      _count: {
        select: {
          tasks: true,
          ticketsRaised: true,
          ticketsHelped: true,
        },
      },
    },
  })

  if (!user) return null

  // Recent activity — open tasks + recent daily log
  const openTasks = await prisma.task.count({
    where: { assigneeId: user.id, status: { not: 'DONE' }, isActive: true },
  })

  const overdueTasks = await prisma.task.count({
    where: {
      assigneeId: user.id,
      status: { not: 'DONE' },
      dueDate: { lt: new Date() },
      isActive: true,
    },
  })

  const lastLog = await prisma.dailyLog.findFirst({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    select: { date: true, workSummary: true },
  })

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    currentStatus: user.currentStatus,
    ...(isAdmin && { email: (user as { email?: string }).email }),
    projects: user.projects.map((p) => p.project),
    leadOf: user.projectsLed,
    counts: {
      tasksTotal: user._count.tasks,
      openTasks,
      overdueTasks,
      ticketsRaised: user._count.ticketsRaised,
      ticketsHelped: user._count.ticketsHelped,
    },
    lastDailyLog: lastLog,
  }
}
