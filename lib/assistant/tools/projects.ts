/**
 * Forgie tools — project queries.
 *
 * Pure DB-query functions exposed to the LLM as tool calls.
 * Each function is permission-scoped: takes (callerUserId, callerRole, ...args)
 * and only returns what the caller is allowed to see.
 *
 * EMPLOYEEs see only projects they're a member of.
 * ADMINs see everything.
 */

import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

export interface ToolUser {
  userId: string
  role: string
}

// ─── list_projects ───────────────────────────────────────────────────────────

export interface ListProjectsArgs {
  status?: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  memberId?: string  // filter to projects this user is on (admin-only override)
  leadId?: string
  limit?: number
}

export async function listProjects(caller: ToolUser, args: ListProjectsArgs = {}) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const isAdmin = isAdminRole(caller.role)

  const where: Prisma.ProjectWhereInput = {
    isActive: true,
    ...(args.status && { status: args.status }),
    ...(args.priority && { priority: args.priority }),
    ...(args.leadId && { leadId: args.leadId }),
    // Employees can only see their own projects, regardless of args.memberId.
    // Admins can pass memberId to scope to a specific person's projects.
    ...(!isAdmin
      ? { members: { some: { userId: caller.userId } } }
      : args.memberId
        ? { members: { some: { userId: args.memberId } } }
        : {}),
  }

  const projects = await prisma.project.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      deadline: true,
      lead: { select: { id: true, name: true } },
      _count: { select: { members: true, tasks: true } },
      tasks: {
        where: { isActive: true },
        select: { status: true, dueDate: true, completedAt: true },
      },
    },
  })

  return projects.map((p) => {
    const totalTasks = p.tasks.length
    const doneTasks = p.tasks.filter((t) => t.status === 'DONE').length
    const overdueTasks = p.tasks.filter(
      (t) => t.status !== 'DONE' && t.dueDate && t.dueDate < new Date(),
    ).length

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      priority: p.priority,
      deadline: p.deadline,
      leadName: p.lead?.name ?? null,
      memberCount: p._count.members,
      taskProgress: { total: totalTasks, done: doneTasks, overdue: overdueTasks },
    }
  })
}

// ─── get_project ─────────────────────────────────────────────────────────────

export async function getProject(caller: ToolUser, projectId: string) {
  const isAdmin = isAdminRole(caller.role)

  // Permission check: employees must be a member
  if (!isAdmin) {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: caller.userId, projectId } },
      select: { id: true },
    })
    if (!membership) return null
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      deadline: true,
      lead: { select: { id: true, name: true, avatarUrl: true } },
      members: {
        select: {
          user: { select: { id: true, name: true, role: true, currentStatus: true } },
        },
      },
      tasks: {
        where: { isActive: true },
        select: { id: true, title: true, status: true, assigneeId: true, dueDate: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      },
      _count: { select: { tickets: true } },
    },
  })

  if (!project) return null

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    deadline: project.deadline,
    lead: project.lead,
    members: project.members.map((m) => m.user),
    tasks: project.tasks,
    ticketCount: project._count.tickets,
  }
}

// ─── get_project_health ──────────────────────────────────────────────────────
// Composite signal: velocity, overdue count, log frequency, ticket pileup.

export async function getProjectHealth(caller: ToolUser, projectId: string) {
  const project = await getProject(caller, projectId)
  if (!project) return null

  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Recent task completions (last 7 days)
  const recentDone = await prisma.task.count({
    where: {
      projectId,
      isActive: true,
      status: 'DONE',
      completedAt: { gte: oneWeekAgo },
    },
  })

  const openTickets = await prisma.ticket.count({
    where: { projectId, status: { in: ['OPEN', 'ACCEPTED'] } },
  })

  const overdueTasks = project.tasks.filter(
    (t) => t.status !== 'DONE' && t.dueDate && t.dueDate < now,
  ).length

  // Days since lead/admin last activity in this project's thread
  const lastThreadMsg = await prisma.threadMessage.findFirst({
    where: { projectThread: { projectId } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  const daysSinceLastActivity = lastThreadMsg
    ? Math.floor((now.getTime() - lastThreadMsg.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Simple heuristic health score (0-100)
  let score = 80
  if (overdueTasks > 0) score -= Math.min(overdueTasks * 5, 30)
  if (openTickets > 3) score -= 10
  if (daysSinceLastActivity !== null && daysSinceLastActivity > 7) score -= 15
  if (recentDone === 0) score -= 10
  if (recentDone >= 5) score += 10
  score = Math.max(0, Math.min(100, score))

  return {
    projectId,
    name: project.name,
    score,
    signals: {
      recentTasksClosed: recentDone,
      openTickets,
      overdueTasks,
      daysSinceLastActivity,
    },
  }
}
