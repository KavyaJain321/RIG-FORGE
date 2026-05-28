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
import * as github from './tools/github'
import * as gcal from './tools/gcal'
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

    // ─── GitHub read tools (only available if GITHUB_TOKEN + GITHUB_ORG set) ─

    ...(github.isGithubEnabled() && {
      gh_list_repos: tool({
        description:
          'List repositories in the RIG 360 GitHub org. Use when the user asks "what repos do we have?" or wants a code inventory. Filter by type or sort order.',
        inputSchema: z.object({
          type: z.enum(['all', 'public', 'private', 'forks', 'sources', 'member']).optional(),
          sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
        execute: async (input) => github.listRepos(input as github.ListReposArgs),
      }),

      gh_get_repo: tool({
        description:
          'Full detail on one GitHub repo: description, stars, language, default branch, open issue count, archived/private flags, URL. Use when the user names a repo.',
        inputSchema: z.object({
          repoName: z.string().describe('Just the repo name (no org prefix). e.g. "osint-scanner"'),
        }),
        execute: async ({ repoName }) => github.getRepo(repoName),
      }),

      gh_list_commits: tool({
        description:
          'Recent commits on a GitHub repo. Optional filters: author (GitHub username), date range, branch.',
        inputSchema: z.object({
          repo: z.string(),
          author: z.string().optional().describe('GitHub username or email'),
          since: z.string().optional().describe('ISO date lower bound'),
          until: z.string().optional().describe('ISO date upper bound'),
          branch: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
        execute: async (input) => github.listCommits(input as github.ListCommitsArgs),
      }),

      gh_list_pull_requests: tool({
        description:
          'List PRs on a GitHub repo. Default state=open. Optional: filter by author. Returns reviewers, labels, draft flag, URLs.',
        inputSchema: z.object({
          repo: z.string(),
          state: z.enum(['open', 'closed', 'all']).optional(),
          author: z.string().optional().describe('GitHub username'),
          limit: z.number().int().positive().max(100).optional(),
        }),
        execute: async (input) => github.listPullRequests(input as github.ListPullRequestsArgs),
      }),

      gh_list_issues: tool({
        description:
          'List issues on a GitHub repo. PRs are excluded. Default state=open. Optional: assignee.',
        inputSchema: z.object({
          repo: z.string(),
          state: z.enum(['open', 'closed', 'all']).optional(),
          assignee: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
        execute: async (input) => github.listIssues(input as github.ListIssuesArgs),
      }),

      gh_get_user_activity: tool({
        description:
          "What a GitHub user has been doing across the org in the last N days — commits, PRs opened, issues opened. Critical for 1-on-1 prep ('what's Abhyam been working on this week?'). Default 7 days.",
        inputSchema: z.object({
          username: z.string().describe('GitHub username'),
          days: z.number().int().positive().max(90).optional(),
        }),
        execute: async (input) => github.getGithubUserActivity(input as github.UserActivityArgs),
      }),

      gh_search_code: tool({
        description:
          'Search code in the org. Returns matching files + their paths. Optional: limit to one repo, filter by language or extension.',
        inputSchema: z.object({
          query: z.string().describe('Text to find inside files'),
          repo: z.string().optional().describe('Optional — limit to this repo'),
          language: z.string().optional(),
          extension: z.string().optional(),
          limit: z.number().int().positive().max(50).optional(),
        }),
        execute: async (input) => github.searchCode(input as github.SearchCodeArgs),
      }),

      gh_get_file_contents: tool({
        description:
          'Read a file from a GitHub repo (or list a directory). Returns text content for files < 100 KB. Use for "show me the README" or "what does the config look like" queries.',
        inputSchema: z.object({
          repo: z.string(),
          path: z.string().describe('File or directory path within the repo'),
          branch: z.string().optional(),
        }),
        execute: async (input) => github.getFileContents(input as github.GetFileContentsArgs),
      }),
    }),
  }
}

// ─── Write proposal tools ────────────────────────────────────────────────────
//
// IMPORTANT: these tools DO NOT mutate state. Their execute() functions just
// return a "proposed" marker. The actual write is gated on a human tapping
// Confirm in the UI, which calls /api/assistant/actions/execute with the
// same args. This keeps Forgie from auto-creating things based on an
// LLM misinterpretation.

const ProposeCreateTaskInput = z.object({
  title: z.string().min(1).describe('Concise task title'),
  projectId: z.string().describe('Exact project ID from the grounded context — do not guess'),
  assigneeId: z.string().optional().describe('Optional — user ID of the assignee'),
  dueDate: z.string().optional().describe('Optional ISO date string (YYYY-MM-DD or full ISO)'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  description: z.string().optional(),
})

const ProposeCreateTicketInput = z.object({
  title: z.string().min(5).describe('Ticket title, at least 5 characters'),
  description: z.string().min(20).describe('Detailed description, at least 20 characters'),
  projectId: z.string().describe('Exact project ID from the grounded context'),
})

const ProposeUpdateTaskStatusInput = z.object({
  taskId: z.string().describe('Exact task ID from the grounded context'),
  newStatus: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
})

export function buildProposeTools(): ToolSet {
  return {
    propose_create_task: tool({
      description:
        'Propose creating a new task. THE TASK IS NOT CREATED until the user taps Confirm on the resulting card. Use whenever the user asks to create or add a task. Always pass the exact projectId from the grounded context.',
      inputSchema: ProposeCreateTaskInput,
      execute: async (input) => ({ proposed: true, action: 'create_task', args: input }),
    }),

    propose_create_ticket: tool({
      description:
        'Propose raising a new support ticket on a project. NOT CREATED until the user confirms. Title must be 5+ chars, description must be 20+ chars.',
      inputSchema: ProposeCreateTicketInput,
      execute: async (input) => ({ proposed: true, action: 'create_ticket', args: input }),
    }),

    propose_update_task_status: tool({
      description:
        'Propose moving a task to TODO, IN_PROGRESS, or DONE. NOT CHANGED until the user confirms.',
      inputSchema: ProposeUpdateTaskStatusInput,
      execute: async (input) => ({ proposed: true, action: 'update_task_status', args: input }),
    }),

    // ─── GitHub write proposals (only if GitHub is configured) ─────────────

    ...(github.isGithubEnabled() && {
      propose_gh_create_repo: tool({
        description:
          'Propose creating a new GitHub repo in the RIG 360 org. The repo is NOT created until the user taps Confirm. Repo name gets lowercased and hyphenated automatically. Defaults: private=true, auto_init=true (creates an initial commit with README).',
        inputSchema: z.object({
          name: z.string().min(1).max(100).describe('Repo name. Will be sanitized to lowercase + hyphens.'),
          description: z.string().max(350).optional(),
          private: z.boolean().optional().describe('Default true'),
          autoInit: z.boolean().optional().describe('Default true — creates initial commit with README'),
        }),
        execute: async (input) => ({ proposed: true, action: 'gh_create_repo', args: input }),
      }),

      propose_gh_create_issue: tool({
        description:
          'Propose filing a GitHub issue on a repo. NOT FILED until the user confirms. Useful when a teammate reports a bug in chat and you want to formalize it as a tracked GitHub issue.',
        inputSchema: z.object({
          repo: z.string().describe('Just the repo name within the org'),
          title: z.string().min(3).max(200),
          body: z.string().max(8000).optional().describe('Optional issue description (markdown OK)'),
          labels: z.array(z.string()).optional(),
          assignees: z.array(z.string()).optional().describe('GitHub usernames to assign'),
        }),
        execute: async (input) => ({ proposed: true, action: 'gh_create_issue', args: input }),
      }),
    }),
  }
}

// Convenience: read + propose tools combined for the message route.
// Synchronous version — Calendar tools are NOT included since they need
// a per-user DB check. Use buildAllToolsAsync from the message route to
// get the full set.
export function buildAllTools(caller: ToolUser): ToolSet {
  return { ...buildReadTools(caller), ...buildProposeTools() }
}

// Async variant: also conditionally includes the per-user Google Calendar
// tools when the user has connected their Google account. Use this from
// API routes; use buildAllTools from sync contexts (tests, etc.).
export async function buildAllToolsAsync(caller: ToolUser): Promise<ToolSet> {
  const base: ToolSet = { ...buildReadTools(caller), ...buildProposeTools() }
  if (await gcal.isUserGcalConnected(caller.userId)) {
    Object.assign(base, buildGcalTools(caller))
  }
  return base
}

// ─── Google Calendar tools (per-user) ────────────────────────────────────────

function buildGcalTools(caller: ToolUser): ToolSet {
  return {
    gcal_list_events: tool({
      description:
        "List the caller's upcoming Google Calendar events. Defaults to the next 7 days. Returns title, start, end, attendees, Meet link, and event URL.",
      inputSchema: z.object({
        timeMin: z.string().optional().describe('ISO datetime; default = now'),
        timeMax: z.string().optional().describe('ISO datetime; default = +7d'),
        query: z.string().optional().describe('Optional substring filter on event title'),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async (input) => gcal.listEvents(caller.userId, input as gcal.ListEventsArgs),
    }),

    gcal_find_free_time: tool({
      description:
        'Find shared free slots across a set of attendees within a date range. Returns candidate slots that fit the requested duration during working hours.',
      inputSchema: z.object({
        attendees: z.array(z.string()).min(1).describe('Email addresses (include caller for self-availability)'),
        durationMinutes: z.number().int().positive().max(480).optional().describe('Default 30'),
        rangeStart: z.string().optional().describe('ISO datetime; default now'),
        rangeEnd: z.string().optional().describe('ISO datetime; default +7d'),
        workingHoursStart: z.number().int().min(0).max(23).optional().describe('Default 9'),
        workingHoursEnd: z.number().int().min(0).max(24).optional().describe('Default 18'),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (input) => gcal.findFreeTime(caller.userId, input as gcal.FindFreeTimeArgs),
    }),

    propose_gcal_create_event: tool({
      description:
        'Propose creating a Google Calendar event. NOT CREATED until the user taps Confirm. Auto-adds a Meet link when attendees are provided (unless withMeetLink=false). Use full ISO datetime strings.',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        start: z.string().describe('ISO datetime for event start'),
        end: z.string().describe('ISO datetime for event end'),
        attendees: z.array(z.string()).optional().describe('Email addresses'),
        description: z.string().max(2000).optional(),
        location: z.string().max(200).optional(),
        withMeetLink: z.boolean().optional().describe('Default true if attendees present'),
      }),
      execute: async (input) => ({
        proposed: true,
        action: 'gcal_create_event',
        args: input,
      }),
    }),

    propose_gcal_cancel_event: tool({
      description:
        'Propose cancelling a Google Calendar event. NOT CANCELLED until the user confirms. Caller must own the event.',
      inputSchema: z.object({
        eventId: z.string().describe('The Google Calendar event ID'),
      }),
      execute: async (input) => ({
        proposed: true,
        action: 'gcal_cancel_event',
        args: input,
      }),
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

Call a READ tool only when:
- The user asks about something specific not in the snapshot (a
  particular project they're not on, a teammate not in the context,
  a deeper drill-down).
- You need a composite health view of a project (get_project_health).
- You need a full profile for one teammate (get_member).
- You need to search/filter beyond what's pre-loaded.
- The question is about CODE — call the gh_* tools to inspect GitHub
  repos, commits, PRs, issues, file contents, or a person's recent
  GitHub activity. Best for "what's Abhyam been working on?",
  "what's open on the OSINT scanner repo?", "show me the README of
  childsafe-monitor", "find where we use the Brave API in our code".

# Proposing write actions

When the user asks you to CREATE, ADD, RAISE, ASSIGN, OPEN, or CLOSE
something, use the matching propose_* tool. These tools do NOT actually
write — they signal the UI to show a confirmation card. Only when the
user taps Confirm does the action happen.

When using a propose_* tool:
- Pull the projectId / taskId / userId from the grounded context, never
  guess.
- If you don't know which project/task/user they mean, ask first.
  Don't propose with wrong IDs.
- In your text reply, briefly say what you're about to propose so the
  user knows what to confirm. One sentence is enough; the card will
  show the full details.

Tool-use rules:
- One well-chosen call beats three broad ones.
- If a tool returns empty results, say so honestly — don't invent.
- Don't chain more than 2-3 tool calls per turn. If you can't answer
  in that budget, just say what you found and ask the user to narrow
  the question.`
