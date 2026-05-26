/**
 * Builds the per-request snapshot Forgie sees about the world.
 *
 * Strategy for v0: instead of letting the LLM call tools on demand,
 * we eagerly load a compact snapshot of what the *current user* can see
 * and inject it as a JSON block into the system prompt. The LLM then
 * answers from that grounded context.
 *
 * Why: tool-calling reliability on free-tier Llama/Gemini varies. Eager
 * context loading gives us predictable behavior with one round-trip per
 * message instead of a 2–5 round-trip tool loop.
 *
 * Tradeoff: more input tokens per message (~800–1500 typical). At Groq's
 * free tier this is fine. We add tool-calling in Phase 2 for write
 * actions and on-demand deep dives.
 */

import { listProjects } from './tools/projects'
import { listTasks } from './tools/tasks'
import { listTickets } from './tools/tickets'
import { isAdminRole } from '@/lib/auth'

export interface ForgieContext {
  user: {
    id: string
    name: string
    role: string
    isAdmin: boolean
  }
  // Compact summaries — the LLM doesn't need every detail, just enough
  // to ground itself when answering.
  myProjects: Array<{
    id: string
    name: string
    status: string
    priority: string
    deadline: string | null
    leadName: string | null
    progress: { done: number; total: number; overdue: number }
  }>
  myTasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    dueDate: string | null
    projectName: string
    isOverdue: boolean
  }>
  myTickets: Array<{
    id: string
    title: string
    status: string
    projectName: string
    role: 'raised' | 'helping'
    ageHours: number
  }>
  // Admin-only: a 30,000-ft view of the whole org
  orgSnapshot?: {
    activeProjectCount: number
    openTaskCount: number
    overdueTaskCount: number
    openTicketCount: number
  }
}

interface BuildArgs {
  userId: string
  userName: string
  userRole: string
}

export async function buildForgieContext(args: BuildArgs): Promise<ForgieContext> {
  const caller = { userId: args.userId, role: args.userRole }
  const isAdmin = isAdminRole(args.userRole)

  // Run all queries in parallel — each is independent.
  const [projects, myTasks, raisedTickets, helpedTickets, orgSnapshot] = await Promise.all([
    listProjects(caller, { status: 'ACTIVE', limit: 20 }),
    listTasks(caller, { mineOnly: true, limit: 20 }),
    listTickets(caller, { raisedById: args.userId, limit: 10 }),
    listTickets(caller, { helperId: args.userId, limit: 10 }),
    isAdmin ? loadOrgSnapshot() : Promise.resolve(undefined),
  ])

  // Merge raised + helped tickets, dedupe by id, mark role
  const ticketMap = new Map<string, ForgieContext['myTickets'][number]>()
  for (const t of raisedTickets) {
    ticketMap.set(t.id, {
      id: t.id,
      title: t.title,
      status: t.status,
      projectName: t.projectName,
      role: 'raised',
      ageHours: t.ageHours,
    })
  }
  for (const t of helpedTickets) {
    // If we raised AND helped, prefer 'helping' since it's the active role
    ticketMap.set(t.id, {
      id: t.id,
      title: t.title,
      status: t.status,
      projectName: t.projectName,
      role: 'helping',
      ageHours: t.ageHours,
    })
  }

  return {
    user: {
      id: args.userId,
      name: args.userName,
      role: args.userRole,
      isAdmin,
    },
    myProjects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      priority: p.priority,
      deadline: p.deadline?.toISOString() ?? null,
      leadName: p.leadName,
      progress: p.taskProgress,
    })),
    myTasks: myTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() ?? null,
      projectName: t.projectName,
      isOverdue: t.isOverdue,
    })),
    myTickets: Array.from(ticketMap.values()),
    ...(orgSnapshot && { orgSnapshot }),
  }
}

// ─── Admin-only org snapshot ─────────────────────────────────────────────────

async function loadOrgSnapshot(): Promise<ForgieContext['orgSnapshot']> {
  const { prisma } = await import('@/lib/db')
  const now = new Date()

  const [activeProjectCount, openTaskCount, overdueTaskCount, openTicketCount] = await Promise.all([
    prisma.project.count({ where: { isActive: true, status: 'ACTIVE' } }),
    prisma.task.count({ where: { isActive: true, status: { not: 'DONE' } } }),
    prisma.task.count({
      where: { isActive: true, status: { not: 'DONE' }, dueDate: { lt: now } },
    }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'ACCEPTED'] } } }),
  ])

  return { activeProjectCount, openTaskCount, overdueTaskCount, openTicketCount }
}

// ─── Render context as a system-prompt block ─────────────────────────────────
// We give the model the data as JSON, but frame it conversationally so it
// reads like "here's what's on this person's plate" rather than a database
// dump. The "use only this" instruction is repeated here even though it's
// in KNOWLEDGE_SCOPE — both spots reinforce honesty.

export function renderContextBlock(ctx: ForgieContext): string {
  return `# Grounded data (the truth — ground all factual claims here)

Here's what's actually in the platform for this person right now.
Every project name, task title, deadline, ticket, and number below
comes from the live database. Treat anything outside this block as
unknown — don't invent details.

\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

A few notes on reading this:
- "myProjects" = projects this user is on (members only; admin sees
  all active).
- "myTasks" = tasks where they are the assignee.
- "myTickets" = tickets they raised OR are helping with; "role" tells
  you which.
- "orgSnapshot" appears only for admins — broad counts across the
  whole platform.
- If a list is empty, that genuinely means there's nothing — don't
  hedge with "I'm not sure".`
}
