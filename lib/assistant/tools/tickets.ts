/**
 * Forgie tools — ticket queries.
 *
 * Tickets are visible to admins and to project members. Forgie can
 * also create tickets on behalf of the caller (gated, UI confirms).
 */

import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/auth'
import { assertNoHtml } from '@/lib/sanitize'
import type { Prisma } from '@prisma/client'
import type { ToolUser } from './projects'

export interface ListTicketsArgs {
  projectId?: string
  status?: 'OPEN' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
  raisedById?: string
  helperId?: string
  mineOnly?: boolean        // tickets I raised OR am helping with
  limit?: number
}

export async function listTickets(caller: ToolUser, args: ListTicketsArgs = {}) {
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100)
  const isAdmin = isAdminRole(caller.role)

  const where: Prisma.TicketWhereInput = {
    ...(args.projectId && { projectId: args.projectId }),
    ...(args.status && { status: args.status }),
    ...(args.raisedById && { raisedById: args.raisedById }),
    ...(args.helperId && { helperId: args.helperId }),
    ...(args.mineOnly && {
      OR: [{ raisedById: caller.userId }, { helperId: caller.userId }],
    }),
    // Employees only see tickets in their projects OR tickets they raised/help
    ...(!isAdmin && {
      OR: [
        { raisedById: caller.userId },
        { helperId: caller.userId },
        { project: { members: { some: { userId: caller.userId } } } },
      ],
    }),
  }

  const tickets = await prisma.ticket.findMany({
    where,
    take: limit,
    orderBy: [
      { status: 'asc' },          // OPEN first
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      acceptedAt: true,
      completedAt: true,
      project: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      helper: { select: { id: true, name: true } },
    },
  })

  const now = Date.now()
  return tickets.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    projectId: t.project.id,
    projectName: t.project.name,
    raisedBy: t.raisedBy,
    helper: t.helper,
    createdAt: t.createdAt,
    ageHours: Math.floor((now - t.createdAt.getTime()) / (1000 * 60 * 60)),
    isStale: t.status === 'OPEN' && now - t.createdAt.getTime() > 24 * 60 * 60 * 1000,
  }))
}

// ─── create_ticket (gated — UI must confirm) ─────────────────────────────────

export interface CreateTicketArgs {
  title: string
  description: string
  projectId: string
}

export async function createTicket(caller: ToolUser, args: CreateTicketArgs) {
  if (args.title.trim().length < 5) throw new Error('Ticket title must be at least 5 characters')
  if (args.description.trim().length < 20) throw new Error('Ticket description must be at least 20 characters')
  assertNoHtml(args.title, 'Ticket title')
  assertNoHtml(args.description, 'Ticket description')

  // Caller must be a member of the project (or admin)
  const isAdmin = isAdminRole(caller.role)
  if (!isAdmin) {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: caller.userId, projectId: args.projectId } },
      select: { id: true },
    })
    if (!membership) throw new Error('You are not a member of this project')
  }

  const ticket = await prisma.ticket.create({
    data: {
      title: args.title.trim(),
      description: args.description.trim(),
      projectId: args.projectId,
      raisedById: caller.userId,
      status: 'OPEN',
    },
    select: {
      id: true,
      title: true,
      status: true,
      project: { select: { id: true, name: true } },
    },
  })
  return ticket
}
