/**
 * Forgie tools — task queries + writes.
 *
 * Write actions (create_task, update_task_status) require the caller
 * to confirm via the UI before they actually execute. The tool functions
 * here are the underlying primitives; the route layer enforces the
 * confirm-before-write policy.
 */

import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import type { ToolUser } from './projects'

// ─── list_tasks ──────────────────────────────────────────────────────────────

export interface ListTasksArgs {
  projectId?: string
  assigneeId?: string
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  overdue?: boolean       // only tasks past their due date and not DONE
  dueBefore?: Date
  dueAfter?: Date
  mineOnly?: boolean      // shortcut for assigneeId = caller
  limit?: number
}

export async function listTasks(caller: ToolUser, args: ListTasksArgs = {}) {
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100)
  const isAdmin = isAdminRole(caller.role)

  // Permission scoping:
  //  - admins see all
  //  - employees see their own tasks OR tasks in projects they're a member of
  const where: Prisma.TaskWhereInput = {
    isActive: true,
    ...(args.projectId && { projectId: args.projectId }),
    ...(args.status && { status: args.status }),
    ...(args.priority && { priority: args.priority }),
    ...(args.assigneeId && { assigneeId: args.assigneeId }),
    ...(args.mineOnly && { assigneeId: caller.userId }),
    ...(args.overdue && {
      status: { not: 'DONE' },
      dueDate: { lt: new Date() },
    }),
    ...(args.dueBefore && { dueDate: { lt: args.dueBefore } }),
    ...(args.dueAfter && { dueDate: { gt: args.dueAfter } }),
    ...(!isAdmin && {
      OR: [
        { assigneeId: caller.userId },
        { project: { members: { some: { userId: caller.userId } } } },
      ],
    }),
  }

  const tasks = await prisma.task.findMany({
    where,
    take: limit,
    orderBy: [
      { status: 'asc' },        // TODO first
      { dueDate: 'asc' },       // earliest deadline first
      { priority: 'desc' },
    ],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      completedAt: true,
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    completedAt: t.completedAt,
    projectName: t.project.name,
    projectId: t.project.id,
    assigneeName: t.assignee?.name ?? null,
    assigneeId: t.assignee?.id ?? null,
    isOverdue: t.status !== 'DONE' && t.dueDate !== null && t.dueDate < new Date(),
  }))
}

// ─── create_task (gated — UI must confirm) ───────────────────────────────────

export interface CreateTaskArgs {
  title: string
  projectId: string
  assigneeId?: string
  dueDate?: Date
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  description?: string
}

export async function createTask(caller: ToolUser, args: CreateTaskArgs) {
  // Must be admin OR project lead OR project member with task-create perm.
  const isAdmin = isAdminRole(caller.role)
  if (!isAdmin) {
    const project = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: { leadId: true, members: { where: { userId: caller.userId } } },
    })
    if (!project) throw new Error('Project not found or you lack access')
    const isLead = project.leadId === caller.userId
    const isMember = project.members.length > 0
    if (!isLead && !isMember) throw new Error('You do not have permission to create tasks in this project')
  }

  const task = await prisma.task.create({
    data: {
      title: args.title.trim(),
      description: args.description?.trim() ?? null,
      projectId: args.projectId,
      assigneeId: args.assigneeId ?? null,
      dueDate: args.dueDate ?? null,
      priority: args.priority ?? 'MEDIUM',
      status: 'TODO',
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  return task
}

// ─── update_task_status (gated — UI must confirm) ────────────────────────────

export async function updateTaskStatus(
  caller: ToolUser,
  taskId: string,
  newStatus: 'TODO' | 'IN_PROGRESS' | 'DONE',
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId, isActive: true },
    select: {
      assigneeId: true,
      project: { select: { leadId: true, members: { where: { userId: caller.userId } } } },
    },
  })
  if (!task) throw new Error('Task not found')

  const isAdmin = isAdminRole(caller.role)
  const isAssignee = task.assigneeId === caller.userId
  const isLead = task.project.leadId === caller.userId
  const isMember = task.project.members.length > 0

  if (!isAdmin && !isAssignee && !isLead && !isMember) {
    throw new Error('You do not have permission to update this task')
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      completedAt: newStatus === 'DONE' ? new Date() : null,
    },
    select: { id: true, title: true, status: true, completedAt: true },
  })
  return updated
}
