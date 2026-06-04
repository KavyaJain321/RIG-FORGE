/**
 * Forgie tool registry.
 *
 * Each entry is:
 *   - name: stable identifier the LLM uses (snake_case)
 *   - description: short, human-readable explanation. The LLM reads this
 *     to decide when to call the tool. Keep tight — every word costs tokens.
 *   - inputSchema: JSON-schema-ish description of the parameters
 *   - isWrite: whether the tool mutates data (UI must confirm before run)
 *   - execute: the actual function (typed)
 *
 * Adding a new tool? Append it here, no other changes required — the
 * provider layer reads the registry and exposes everything to the model.
 */

import * as projects from './projects'
import * as tasks from './tasks'
import * as members from './members'
import * as tickets from './tickets'
import type { ToolUser } from './projects'

export type ToolName =
  | 'list_projects'
  | 'get_project'
  | 'get_project_health'
  | 'list_tasks'
  | 'create_task'
  | 'update_task_status'
  | 'list_members'
  | 'get_member'
  | 'list_tickets'
  | 'create_ticket'

export interface ToolDefinition {
  name: ToolName
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required?: string[]
  }
  isWrite: boolean
}

// ─── Read tools ──────────────────────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  {
    name: 'list_projects',
    description:
      'List projects, optionally filtered by status, priority, or member. Returns id, name, status, priority, deadline, lead, member count, task progress, and overdue count for each.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        memberId: { type: 'string', description: 'Scope to a specific person\'s projects (admins only).' },
        leadId: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    isWrite: false,
  },
  {
    name: 'get_project',
    description:
      'Get full detail for one project: description, members, tasks, ticket count, lead, deadline.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
    isWrite: false,
  },
  {
    name: 'get_project_health',
    description:
      'Composite health snapshot for one project: score (0-100), recent tasks closed, open tickets, overdue tasks, and days since last thread activity. Use when asked "how is project X" in evaluative terms.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
    isWrite: false,
  },
  {
    name: 'list_tasks',
    description:
      'List tasks across projects. Common filters: mineOnly (caller\'s own tasks), overdue (past due and not done), status, assigneeId, projectId, dueBefore/dueAfter for date windows. Default ordering: TODO first, earliest deadline.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        assigneeId: { type: 'string' },
        status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        overdue: { type: 'boolean' },
        mineOnly: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
    isWrite: false,
  },
  {
    name: 'create_task',
    description:
      'Create a new task in a project. Caller must be the project lead, a member, or an admin. Always describe the task to the user first; the UI will confirm before this runs.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        projectId: { type: 'string' },
        assigneeId: { type: 'string' },
        dueDate: { type: 'string', description: 'ISO 8601 date' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        description: { type: 'string' },
      },
      required: ['title', 'projectId'],
    },
    isWrite: true,
  },
  {
    name: 'update_task_status',
    description: 'Move a task to TODO, IN_PROGRESS, or DONE. Caller must be assignee, project lead, member, or admin.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        newStatus: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
      },
      required: ['taskId', 'newStatus'],
    },
    isWrite: true,
  },
  {
    name: 'list_members',
    description:
      'Browse the team directory. Filters: search (partial name), projectId (members of a project), role, status. Admins see emails; employees see public profile fields only.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        projectId: { type: 'string' },
        role: { type: 'string', enum: ['ADMIN', 'EMPLOYEE', 'SUPER_ADMIN'] },
        status: { type: 'string', enum: ['WORKING', 'NOT_WORKING'] },
        limit: { type: 'number' },
      },
    },
    isWrite: false,
  },
  {
    name: 'get_member',
    description:
      'Detail on one person — projects, leadership roles, open task count, overdue count, last daily log. Accepts id OR exact-ish name.',
    inputSchema: {
      type: 'object',
      properties: {
        userIdOrName: { type: 'string' },
      },
      required: ['userIdOrName'],
    },
    isWrite: false,
  },
  {
    name: 'list_tickets',
    description:
      'List support tickets. Filters: projectId, status, raisedById, helperId, mineOnly (raised by me OR helping). Returns age in hours and "isStale" flag (open >24h).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        status: { type: 'string', enum: ['OPEN', 'ACCEPTED', 'COMPLETED', 'CANCELLED'] },
        raisedById: { type: 'string' },
        helperId: { type: 'string' },
        mineOnly: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
    isWrite: false,
  },
  {
    name: 'create_ticket',
    description:
      'Raise a new support ticket on a project. Title min 5 chars, description min 20. Caller must be a project member or admin. Always describe to user first; UI will confirm.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['title', 'description', 'projectId'],
    },
    isWrite: true,
  },
]

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Called by the route layer when the LLM emits a tool call.
// Returns the typed result OR throws — the route translates the error.

export async function executeTool(
  caller: ToolUser,
  name: ToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'list_projects':
      return projects.listProjects(caller, args as projects.ListProjectsArgs)
    case 'get_project':
      return projects.getProject(caller, args.projectId as string)
    case 'get_project_health':
      return projects.getProjectHealth(caller, args.projectId as string)

    case 'list_tasks':
      return tasks.listTasks(caller, args as tasks.ListTasksArgs)
    case 'create_task':
      return tasks.createTask(caller, args as unknown as tasks.CreateTaskArgs)
    case 'update_task_status':
      return tasks.updateTaskStatus(
        caller,
        args.taskId as string,
        args.newStatus as 'TODO' | 'IN_PROGRESS' | 'DONE',
      )

    case 'list_members':
      return members.listMembers(caller, args as members.ListMembersArgs)
    case 'get_member':
      return members.getMember(caller, args.userIdOrName as string)

    case 'list_tickets':
      return tickets.listTickets(caller, args as tickets.ListTicketsArgs)
    case 'create_ticket':
      return tickets.createTicket(caller, args as unknown as tickets.CreateTicketArgs)

    default: {
      const exhaustive: never = name
      throw new Error(`Unknown tool: ${exhaustive as string}`)
    }
  }
}
