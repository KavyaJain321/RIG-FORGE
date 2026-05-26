/**
 * AI SDK tool adapter for Forgie.
 *
 * Converts our typed Prisma-backed read tools (lib/assistant/tools/*) into
 * the shape AI SDK v6 expects: { description, inputSchema (Zod), execute }.
 *
 * Only READ tools are exposed to the LLM for auto-execution. Write tools
 * (create_task, create_ticket, update_task_status) go through the proposal
 * + confirmation flow defined in app/api/assistant/actions/* and are NOT
 * included here — the LLM never directly mutates state without a human
 * tap.
 */

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

import * as projects from './tools/projects'
import * as tasks from './tools/tasks'
import * as members from './tools/members'
import * as tickets from './tools/tickets'
import type { ToolUser } from './tools/projects'

// ─── Read tools — safe to auto-execute ───────────────────────────────────────

export function buildReadTools(caller: ToolUser): ToolSet {
  return {
    list_projects: tool({
      description:
        'List projects visible to the caller. Returns name, status, priority, lead, member count, and task progress for each. Use when the user asks about multiple projects or wants an overview.',
      inputSchema: z.object({
        status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional()
          .describe('Filter by project status'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        memberId: z.string().optional()
          .describe('Show only projects this person is on (admins only)'),
        leadId: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async (input) => projects.listProjects(caller, input as projects.ListProjectsArgs),
    }),

    get_project: tool({
      description:
        'Get full detail on one project: description, members, tasks, lead, deadline, ticket count. Use when the user names a project and wants to know more.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID to look up'),
      }),
      execute: async ({ projectId }) => projects.getProject(caller, projectId),
    }),

    get_project_health: tool({
      description:
        'Composite health score (0-100) for one project, plus signals: recent tasks closed, open tickets, overdue tasks, days since last thread activity. Use for evaluative questions ("how is project X doing", "is X on track").',
      inputSchema: z.object({
        projectId: z.string(),
      }),
      execute: async ({ projectId }) => projects.getProjectHealth(caller, projectId),
    }),

    list_tasks: tool({
      description:
        "List tasks. Filters: mineOnly (caller's own), overdue, status, projectId, assigneeId. Default order: TODO first, then by earliest deadline.",
      inputSchema: z.object({
        projectId: z.string().optional(),
        assigneeId: z.string().optional(),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        overdue: z.boolean().optional()
          .describe('Only tasks past their due date and not done'),
        mineOnly: z.boolean().optional()
          .describe('Shortcut for assigneeId = caller'),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async (input) => tasks.listTasks(caller, input as tasks.ListTasksArgs),
    }),

    list_members: tool({
      description:
        'Browse the team. Filters: search (partial name), projectId (members of), role, status (WORKING/NOT_WORKING). Use when looking up colleagues or checking who is on a project.',
      inputSchema: z.object({
        search: z.string().optional(),
        projectId: z.string().optional(),
        role: z.enum(['ADMIN', 'EMPLOYEE', 'SUPER_ADMIN']).optional(),
        status: z.enum(['WORKING', 'NOT_WORKING']).optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async (input) => members.listMembers(caller, input as members.ListMembersArgs),
    }),

    get_member: tool({
      description:
        'Detail on one teammate: their projects, projects they lead, open task count, overdue count, last daily log. Accepts user id OR partial name.',
      inputSchema: z.object({
        userIdOrName: z.string()
          .describe('Internal user ID, or a name fragment like "Pranav" or "Abhyam"'),
      }),
      execute: async ({ userIdOrName }) => members.getMember(caller, userIdOrName),
    }),

    list_tickets: tool({
      description:
        'List support tickets. Filters: projectId, status, raisedById, helperId, mineOnly (raised by OR helping with). Each ticket includes age in hours and an isStale flag (open >24h).',
      inputSchema: z.object({
        projectId: z.string().optional(),
        status: z.enum(['OPEN', 'ACCEPTED', 'COMPLETED', 'CANCELLED']).optional(),
        raisedById: z.string().optional(),
        helperId: z.string().optional(),
        mineOnly: z.boolean().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async (input) => tickets.listTickets(caller, input as tickets.ListTicketsArgs),
    }),
  }
}

// ─── Tool-use guidance for the system prompt ─────────────────────────────────
// Appended to the system prompt so the model knows WHEN to reach for tools
// instead of answering from the pre-loaded grounded context.

export const TOOL_USE_GUIDANCE = `# When to call tools vs answer from context

The GROUNDED DATA block already has the user's projects, their tasks,
their tickets, and (for admins) an org snapshot. Use it for common
questions — don't call tools for things already loaded.

Call a tool only when:
- The user asks about something specific not in the snapshot (a
  particular project they're not directly on, a teammate not in the
  context, a deeper drill-down).
- You need a composite health view of a specific project (get_project_health).
- The user names a teammate and you want their full profile (get_member).
- You need to search/filter beyond what's pre-loaded.

Tool-use rules:
- One well-chosen call beats three broad ones.
- If a tool returns empty results, say so honestly — don't invent.
- Don't chain more than 2-3 tool calls per turn. If you can't answer
  in that budget, just say what you found and ask the user to narrow
  the question.`
