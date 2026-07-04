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

// ─── create_project (gated — UI must confirm) ─────────────────────────────────
//
// Mirrors the server-side rules of POST /api/projects: admin-only, name 1-100
// chars, no HTML in name/description, leadId must reference a real active
// user. Auto-creates the ProjectThread and adds the lead as a member, just
// like the regular project-creation flow — so the project shows up correctly
// everywhere else in the app.

export interface CreateProjectArgs {
  name: string
  description?: string
  status?: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  deadline?: Date
  leadId: string
  memberIds?: string[]   // optional extras to add as members at creation time
}

const HTML_TAG_RE = /<[^>]+>/i

export async function createProject(caller: ToolUser, args: CreateProjectArgs) {
  if (!isAdminRole(caller.role)) {
    throw new Error('Only admins and super admins can do this task.')
  }

  const name = args.name.trim()
  if (name.length === 0) throw new Error('Project name is required')
  if (name.length > 100) throw new Error('Project name must be at most 100 characters')
  if (HTML_TAG_RE.test(name)) throw new Error('Project name must not contain HTML/script tags')

  const description = args.description?.trim() ?? null
  if (description && description.length > 500) {
    throw new Error('Project description must be at most 500 characters')
  }
  if (description && HTML_TAG_RE.test(description)) {
    throw new Error('Project description must not contain HTML/script tags')
  }

  // Verify the lead exists and is active
  const leadUser = await prisma.user.findUnique({
    where: { id: args.leadId, isActive: true },
    select: { id: true, name: true },
  })
  if (!leadUser) throw new Error('leadId must reference an active user')

  // Dedupe member IDs (lead is auto-added separately so drop them here)
  const extraMembers = Array.from(
    new Set((args.memberIds ?? []).filter((id) => id && id !== args.leadId)),
  )

  // Verify all extra members exist
  if (extraMembers.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: extraMembers }, isActive: true },
      select: { id: true },
    })
    if (found.length !== extraMembers.length) {
      throw new Error('One or more memberIds reference unknown or inactive users')
    }
  }

  const project = await prisma.project.create({
    data: {
      name,
      description,
      status: args.status ?? 'ACTIVE',
      priority: args.priority ?? 'MEDIUM',
      deadline: args.deadline ?? null,
      leadId: args.leadId,
      links: [],
      members: {
        // Lead is always a member; add the rest alongside.
        create: [
          { userId: args.leadId },
          ...extraMembers.map((id) => ({ userId: id })),
        ],
      },
      thread: { create: {} },
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      deadline: true,
      lead: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  })

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    priority: project.priority,
    deadline: project.deadline,
    leadName: project.lead?.name ?? null,
    memberCount: project._count.members,
  }
}

// ─── add_project_member (gated — UI must confirm) ─────────────────────────────
//
// Admin OR the project lead can add a member.
// Idempotent: re-adding an existing member returns the existing record.

export interface AddProjectMemberArgs {
  projectId: string
  userId: string
}

export async function addProjectMember(caller: ToolUser, args: AddProjectMemberArgs) {
  const project = await prisma.project.findUnique({
    where: { id: args.projectId, isActive: true },
    select: { id: true, name: true, leadId: true },
  })
  if (!project) throw new Error('Project not found')

  const isAdmin = isAdminRole(caller.role)
  const isLead = project.leadId === caller.userId
  if (!isAdmin && !isLead) {
    throw new Error('Only admins or the project lead can add members')
  }

  const target = await prisma.user.findUnique({
    where: { id: args.userId, isActive: true },
    select: { id: true, name: true },
  })
  if (!target) throw new Error('User to add must reference an active user')

  // Upsert — idempotent. The unique constraint on (userId, projectId) makes
  // this safe even under concurrent requests.
  await prisma.projectMember.upsert({
    where: { userId_projectId: { userId: target.id, projectId: project.id } },
    create: { userId: target.id, projectId: project.id },
    update: {},
  })

  return {
    projectId: project.id,
    projectName: project.name,
    userId: target.id,
    userName: target.name,
  }
}

// ─── set_project_lead (gated — UI must confirm) ───────────────────────────────
//
// Admin-only. Changes the lead and ensures the new lead is also a member.

export interface SetProjectLeadArgs {
  projectId: string
  newLeadId: string
}

export async function setProjectLead(caller: ToolUser, args: SetProjectLeadArgs) {
  if (!isAdminRole(caller.role)) {
    throw new Error('Only admins and super admins can do this task.')
  }

  const project = await prisma.project.findUnique({
    where: { id: args.projectId, isActive: true },
    select: { id: true, name: true, leadId: true },
  })
  if (!project) throw new Error('Project not found')

  const newLead = await prisma.user.findUnique({
    where: { id: args.newLeadId, isActive: true },
    select: { id: true, name: true },
  })
  if (!newLead) throw new Error('newLeadId must reference an active user')

  if (project.leadId === newLead.id) {
    // No-op, but still return success so the UI confirms cleanly
    return {
      projectId: project.id,
      projectName: project.name,
      leadId: newLead.id,
      leadName: newLead.name,
      changed: false,
    }
  }

  // Transaction: update lead + ensure new lead is a member
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({
      where: { id: project.id },
      data: { leadId: newLead.id },
      select: { id: true, name: true },
    })
    await tx.projectMember.upsert({
      where: { userId_projectId: { userId: newLead.id, projectId: project.id } },
      create: { userId: newLead.id, projectId: project.id },
      update: {},
    })
    return p
  })

  return {
    projectId: updated.id,
    projectName: updated.name,
    leadId: newLead.id,
    leadName: newLead.name,
    changed: true,
  }
}

// ─── update_project (gated — UI must confirm) ─────────────────────────────────
//
// Mirrors PATCH /api/projects/[id] exactly:
//   • description + links → admin OR the project lead
//   • name / status / priority / deadline / leadId → admin (or super-admin) only
// An EMPLOYEE who isn't the lead can't touch anything. A lead who isn't an
// admin can only edit the description/links; if they try to change an
// admin-only field we refuse with the standard message so Forgie can relay it.

export interface UpdateProjectArgs {
  projectId: string
  name?: string
  description?: string | null
  status?: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  deadline?: Date | null
  newLeadId?: string
}

const ADMIN_ONLY_MSG = 'Only admins and super admins can do this task.'

export async function updateProject(caller: ToolUser, args: UpdateProjectArgs) {
  const project = await prisma.project.findUnique({
    where: { id: args.projectId, isActive: true },
    select: { id: true, name: true, leadId: true },
  })
  if (!project) throw new Error('Project not found')

  const isAdmin = isAdminRole(caller.role)
  const isLead = project.leadId === caller.userId

  // Non-admin, non-lead → can't edit anything.
  if (!isAdmin && !isLead) {
    throw new Error('Only admins, super admins, or the project lead can edit a project.')
  }

  const wantsAdminOnlyField =
    args.name !== undefined ||
    args.status !== undefined ||
    args.priority !== undefined ||
    args.deadline !== undefined ||
    args.newLeadId !== undefined

  if (wantsAdminOnlyField && !isAdmin) {
    // A lead tried to change name/status/priority/deadline/lead.
    throw new Error(ADMIN_ONLY_MSG)
  }

  const data: Prisma.ProjectUpdateInput = {}

  if (args.name !== undefined) {
    const name = args.name.trim()
    if (name.length === 0) throw new Error('Project name must not be empty')
    if (name.length > 100) throw new Error('Project name must be at most 100 characters')
    if (HTML_TAG_RE.test(name)) throw new Error('Project name must not contain HTML/script tags')
    data.name = name
  }

  if (args.description !== undefined) {
    const description = args.description === null ? null : args.description.trim()
    if (description && description.length > 500) {
      throw new Error('Project description must be at most 500 characters')
    }
    if (description && HTML_TAG_RE.test(description)) {
      throw new Error('Project description must not contain HTML/script tags')
    }
    data.description = description
  }

  if (args.status !== undefined) data.status = args.status
  if (args.priority !== undefined) data.priority = args.priority
  if (args.deadline !== undefined) data.deadline = args.deadline

  if (args.newLeadId !== undefined) {
    const newLead = await prisma.user.findUnique({
      where: { id: args.newLeadId, isActive: true },
      select: { id: true },
    })
    if (!newLead) throw new Error('newLeadId must reference an active user')
    data.lead = { connect: { id: newLead.id } }
  }

  if (Object.keys(data).length === 0) {
    throw new Error('No fields to update were provided')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({
      where: { id: project.id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        priority: true,
        deadline: true,
        leadId: true,
      },
    })
    // Keep a reassigned lead as a member too, matching set_project_lead.
    if (args.newLeadId !== undefined) {
      await tx.projectMember.upsert({
        where: { userId_projectId: { userId: args.newLeadId, projectId: project.id } },
        create: { userId: args.newLeadId, projectId: project.id },
        update: {},
      })
    }
    return p
  })

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    status: updated.status,
    priority: updated.priority,
    deadline: updated.deadline,
    updatedFields: Object.keys(data),
  }
}

// ─── archive_project (gated — UI must confirm) ────────────────────────────────
//
// Admin-only. Mirrors DELETE /api/projects/[id]: soft-delete (isActive=false)
// and mark ARCHIVED. There is no hard delete anywhere in the app.

export async function archiveProject(caller: ToolUser, projectId: string) {
  if (!isAdminRole(caller.role)) {
    throw new Error(ADMIN_ONLY_MSG)
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId, isActive: true },
    select: { id: true, name: true },
  })
  if (!project) throw new Error('Project not found')

  await prisma.project.update({
    where: { id: project.id },
    data: { isActive: false, status: 'ARCHIVED' },
  })

  return { id: project.id, name: project.name, archived: true }
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
