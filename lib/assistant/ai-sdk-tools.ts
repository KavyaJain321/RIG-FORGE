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
import * as gmail from './tools/gmail'
import * as gdrive from './tools/gdrive'
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
      description: [
        'Browse the team. Filters: search (partial name), projectId (members of),',
        'role, status (WORKING/NOT_WORKING). Use when looking up colleagues or',
        'checking who is on a project.',
        'For admins each member includes `contactEmail` — their DELIVERABLE inbox',
        '(their connected Google account, else a manually-set personal Gmail).',
        'ALWAYS use `contactEmail` as the recipient when emailing someone — never',
        'the `email` field (that is just a name@rigforge.com login and will bounce).',
      ].join(' '),
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
      description: [
        'Detail on one teammate: their projects, projects they lead, open task',
        'count, overdue count, last daily log. Accepts user id OR partial name.',
        'For admins the result includes `contactEmail` (the DELIVERABLE inbox:',
        'their connected Google account if present, otherwise a manual personal',
        'Gmail) and `contactEmailSource` ("google-connected" | "manual" | null).',
        'When the user asks you to email a teammate by name, call this FIRST to',
        'get their `contactEmail`, then use THAT as the recipient. If contactEmail',
        'is null, tell the user you have no email on file for that person instead',
        'of guessing or using the @rigforge.com login address.',
      ].join(' '),
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

    // ─── Project lifecycle (admin-only on execute) ─────────────────────────

    propose_create_project: tool({
      description: [
        'Propose creating a new RIG FORGE project. NOT CREATED until the user',
        'taps Confirm. Admin-only at the execute layer — refuse politely if the',
        'caller is an EMPLOYEE.',
        '',
        'leadId MUST be a real user ID. If the user says "make me lead", use',
        "the caller's own user ID from the grounded context (me.id).",
        'If they say "make Pranav lead", first call list_members with',
        'search="Pranav" to look up the ID — never guess.',
        '',
        'memberIds is optional extras to add at creation time. The lead is',
        'auto-added as a member; do not also include the leadId in memberIds.',
      ].join(' '),
      inputSchema: z.object({
        name: z.string().min(1).max(100).describe('Project name (1-100 chars, no HTML)'),
        description: z.string().max(500).optional(),
        status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional()
          .describe('Default ACTIVE'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional()
          .describe('Default MEDIUM'),
        deadline: z.string().optional().describe('ISO date string'),
        leadId: z.string().min(1).describe('User ID who will lead this project'),
        memberIds: z.array(z.string()).optional()
          .describe('Extra members to add at creation (lead is added automatically)'),
      }),
      execute: async (input) => ({ proposed: true, action: 'create_project', args: input }),
    }),

    propose_add_project_member: tool({
      description: [
        'Propose adding a teammate to an existing project. NOT ADDED until the',
        "user confirms. Admin or the project's current lead can do this.",
        '',
        'projectId must match an existing project from the grounded context or',
        'a list_projects result. userId must be looked up from list_members or',
        'taken from the grounded context — never invent.',
      ].join(' '),
      inputSchema: z.object({
        projectId: z.string().min(1).describe('Project to add the member to'),
        userId: z.string().min(1).describe('User to add as a member'),
      }),
      execute: async (input) => ({ proposed: true, action: 'add_project_member', args: input }),
    }),

    propose_set_project_lead: tool({
      description: [
        'Propose changing the lead of an existing project. NOT CHANGED until',
        'the user confirms. Admin-only at the execute layer.',
        '',
        'If the new lead is not already a member, they are added automatically.',
      ].join(' '),
      inputSchema: z.object({
        projectId: z.string().min(1),
        newLeadId: z.string().min(1).describe('User ID who will become the lead'),
      }),
      execute: async (input) => ({ proposed: true, action: 'set_project_lead', args: input }),
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

// Async variant: also conditionally includes the per-user Google tools
// (Calendar / Gmail / Drive) when the user has the right scopes granted.
// Use this from API routes; use buildAllTools from sync contexts.
export async function buildAllToolsAsync(caller: ToolUser): Promise<ToolSet> {
  const base: ToolSet = { ...buildReadTools(caller), ...buildProposeTools() }

  // Calendar, Gmail, Drive are independent — a user might have authorized
  // some but not others (e.g. legacy connection from before P8 added
  // Gmail/Drive scopes). We check each separately.
  const [hasGcal, hasGmail, hasDrive] = await Promise.all([
    gcal.isUserGcalConnected(caller.userId),
    gmail.isUserGmailEnabled(caller.userId),
    gdrive.isUserDriveEnabled(caller.userId),
  ])

  if (hasGcal) Object.assign(base, buildGcalTools(caller))
  if (hasGmail) Object.assign(base, buildGmailTools(caller))
  if (hasDrive) Object.assign(base, buildGdriveTools(caller))

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

// ─── Gmail tools (per-user) ──────────────────────────────────────────────────

function buildGmailTools(caller: ToolUser): ToolSet {
  return {
    gmail_search: tool({
      description:
        "Search the caller's Gmail. Supports Gmail's filter syntax: from:, to:, subject:, after:YYYY/MM/DD, before:, is:unread, has:attachment, label:. Returns message metadata + snippets.",
      inputSchema: z.object({
        query: z.string().describe('Gmail search query'),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (input) =>
        gmail.searchMessages(caller.userId, input as gmail.SearchArgs),
    }),

    gmail_get_message: tool({
      description:
        'Get the full body of one Gmail message by ID (from gmail_search results). Use when the snippet isn\'t enough and you need the full text.',
      inputSchema: z.object({
        messageId: z.string(),
      }),
      execute: async (input) =>
        gmail.getMessage(caller.userId, input as gmail.GetMessageArgs),
    }),

    propose_gmail_send: tool({
      description: [
        "Propose sending an email FROM the caller's Gmail account. NOT SENT",
        'until the user confirms. Default is plain text; pass isHtml=true for',
        'HTML formatting.',
        '',
        'RECIPIENT RESOLUTION — read carefully:',
        'If the user names a TEAMMATE instead of giving a literal email address',
        '("send a mail to Radhesh", "email Rohit Gandhi sir"), you MUST first call',
        'get_member with that name and use the returned `contactEmail` as the `to`.',
        'NEVER send to a name@rigforge.com address — those are login identifiers',
        'with no mailbox and will bounce. If get_member returns contactEmail=null,',
        'do NOT send; tell the user there is no email on file for that person and',
        'ask them to provide one (or have that teammate connect Google / fill it in).',
        'Only when the user supplies a literal email address may you use it directly.',
        '',
        'CRITICAL URL HANDLING — read carefully:',
        '',
        'When a calendar event, Meet link, Drive folder, or Drive file was',
        'created in the SAME conversation turn (via propose_gcal_create_event,',
        'propose_drive_create_folder, propose_drive_create_doc), you do NOT',
        'know the real URL yet — those URLs contain random IDs generated by',
        'Google only after the user taps Confirm. Including them in the email',
        'body means hallucinating fake URLs that will 404.',
        '',
        'Rules:',
        '  • Meet links: DO NOT include in email. Google auto-sends the',
        '    Calendar invite to attendees with the real Meet link attached.',
        '    Just mention "the Meet link is in the Calendar invite".',
        '  • Calendar event URLs: same — never include.',
        '  • Drive file/folder URLs: DO NOT include. Tell the recipient the',
        '    file has been created/shared instead.',
        '',
        'EXCEPTION — GitHub repo URLs ARE deterministic:',
        `  When propose_gh_create_repo was called in the same turn with name="X",`,
        `  the resulting URL will be EXACTLY: https://github.com/${process.env.GITHUB_ORG ?? '<org>'}/X`,
        `  You may include this URL in the email body. The org slug is`,
        `  literally "${process.env.GITHUB_ORG ?? 'unset'}" — do not abbreviate, drop suffixes,`,
        `  or change capitalization. Get it exactly right.`,
        '',
        'GitHub issue URLs follow:',
        `  https://github.com/${process.env.GITHUB_ORG ?? '<org>'}/<repo>/issues/<number>`,
        '  but you only know the number after the issue is filed — so do NOT',
        '  include issue URLs for issues being filed in the same turn.',
        '',
        'REQUIRED email body structure (always follow this order, blank line',
        'between each section):',
        '',
        '  1. OPENING — exactly one line:',
        '       "Hi there, it\'s Forgie here."',
        '     Nothing else on this line. Do not append "AI assistant for X"',
        '     or anything else. Just that.',
        '',
        '  2. MAIN MESSAGE — written in first person as Forgie, paraphrasing',
        '     what the caller wants to convey. Start it with something like:',
        '       "I wanted to let you know that <CallerFirstName> just ..."',
        '       "Just a quick note — <CallerFirstName> has ..."',
        '       "Heads up — <CallerFirstName> set up ..."',
        '     Vary the opener; don\'t use the exact same phrasing every time.',
        '     Keep it conversational and short.',
        '',
        '     PRONOUN RULE — never use gendered pronouns (he/she/him/her/his/',
        '     hers) for the caller OR the recipient. Refer to people by name,',
        '     OR use neutral phrasing ("they"/"their" only when unavoidable).',
        '     Examples:',
        '       ✓ "Kavya just set up a meeting..."',
        '       ✓ "There\'s a calendar invite on your end..."',
        '       ✗ "Kavya wanted me to let you know she just..."',
        '       ✗ "He scheduled a sync..."',
        '',
        '  3. RELEVANT LINKS — if a calendar event was created in this same',
        '     conversation turn, include its Meet link AND event URL as',
        '     labeled lines. Same for GitHub PR/issue URLs, Drive URLs, etc.',
        '     Format like:',
        '       "Meet link: <url>"',
        '       "Calendar event: <url>"',
        '',
        '  4. SIGN-OFF — exactly these two lines:',
        '       "Catch you then!"',
        '       "— Forgie 🤖 (AI assistant in RIG FORGE, sending this for <CallerFirstName>)"',
        '     Vary "Catch you then!" only when it doesn\'t fit the context',
        '     (e.g. no meeting → use "Hope that helps!" or "Have a good one!"',
        '     instead). The "— Forgie 🤖" line stays exactly as shown.',
        '',
        'Never use "Hi <Name>" or "Dear <Name>" — always "Hi there".',
      ].join('\n'),
      inputSchema: z.object({
        to: z.string().describe('Recipient email(s), comma-separated for multiple'),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(20000),
        cc: z.string().optional(),
        bcc: z.string().optional(),
        isHtml: z.boolean().optional(),
      }),
      execute: async (input) => ({
        proposed: true,
        action: 'gmail_send',
        args: input,
      }),
    }),
  }
}

// ─── Drive tools (per-user) ──────────────────────────────────────────────────

function buildGdriveTools(caller: ToolUser): ToolSet {
  return {
    drive_search: tool({
      description:
        "Search the caller's Google Drive. Matches file name AND file content (for indexed files). Optional filters by mimeType or parent folder. Returns id, name, type, modified time, URL.",
      inputSchema: z.object({
        query: z.string(),
        mimeType: z.string().optional().describe('e.g. application/pdf'),
        parentFolderId: z.string().optional(),
        includeTrashed: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (input) =>
        gdrive.searchDrive(caller.userId, input as gdrive.DriveSearchArgs),
    }),

    drive_list_folder: tool({
      description:
        'List contents of one Drive folder by ID. Returns files + subfolders sorted with folders first.',
      inputSchema: z.object({
        folderId: z.string(),
        limit: z.number().int().positive().max(200).optional(),
      }),
      execute: async (input) =>
        gdrive.listFolder(caller.userId, input as gdrive.ListFolderArgs),
    }),

    drive_get_file: tool({
      description:
        'Get a Drive file: metadata + content (when the file is text/markdown/JSON/Google Doc and under 100 KB). Use when the user asks "show me the content of X" or "what does X say".',
      inputSchema: z.object({
        fileId: z.string(),
      }),
      execute: async (input) =>
        gdrive.getFile(caller.userId, input as gdrive.GetFileArgs),
    }),

    propose_drive_create_folder: tool({
      description:
        "Propose creating a new folder in the caller's Drive. NOT CREATED until the user confirms. Use parentFolderId to nest inside an existing folder; omit it to create at the Drive root.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        parentFolderId: z.string().optional(),
      }),
      execute: async (input) => ({
        proposed: true,
        action: 'drive_create_folder',
        args: input,
      }),
    }),

    propose_drive_create_doc: tool({
      description:
        "Propose creating a text file or Google Doc in the caller's Drive. NOT CREATED until the user confirms. Default format='text' creates a .txt; format='gdoc' creates a real Google Doc that's editable in Docs.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        content: z.string().min(1).max(50000),
        format: z.enum(['text', 'gdoc']).optional(),
        parentFolderId: z.string().optional(),
      }),
      execute: async (input) => ({
        proposed: true,
        action: 'drive_create_doc',
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
  GitHub activity.

# Name resolution — strip honorifics first

Users naturally use honorifics and nicknames: "Rohit sir", "Radhesh bhai",
"sir", "ma'am", "ji", "bro", etc. NEVER pass these verbatim to get_member
or list_members — the search will fail. Always extract just the first name
or full name:

  ✓ "Rohit sir"    → search "Rohit"
  ✓ "Radhesh bhai" → search "Radhesh"
  ✓ "Pranav ji"    → search "Pranav"
  ✗ "Rohit sir"    → DO NOT search "Rohit sir"

If the name alone is ambiguous (multiple Rohits), list the matches and ask
the user to clarify.

# Scheduling and calendar requests

When asked to "schedule a meeting with X for tomorrow at 4 PM":
1. Resolve X → call get_member("X") to get their contactEmail (their real
   Gmail — NOT their @rigforge.com login). Use contactEmail as an attendee.
2. Call propose_gcal_create_event with the resolved attendee email.
   Google will auto-send them a calendar invite.

When asked to "check X's calendar / find free time with X":
- You can only see your OWN calendar events (gcal_list_events) and check
  free/busy across email addresses using gcal_find_free_time.
- gcal_find_free_time takes email addresses as attendees. Use the person's
  contactEmail. If contactEmail is null, tell the user you don't have their
  email on file and suggest they connect Google.
- If the user says "check calendar for tomorrow then schedule" — do BOTH
  in one turn: call gcal_find_free_time first, then propose the event based
  on what's free. Narrate the result ("I checked — 4 PM looks clear, here's
  the proposal") before showing the card.

# Emailing teammates by name

A teammate's @rigforge.com address is a LOGIN ID, not a real inbox —
mail to it bounces. When the user says "email <name>" / "send a mail to
<name>", strip honorifics, call get_member, use the returned contactEmail.
If contactEmail is null, tell the user there's no email on file.

# Vague or informal requests

RIG FORGE is used in a fast-paced team setting. Users will be informal:
"set up a meet with rohit sir and radhesh for tmrw", "ping pranav about the
deadline", "check if anyone's free at 3". Handle these gracefully:
- Parse intent, don't ask for clarification unless truly ambiguous.
- Infer reasonable defaults: "tmrw" = tomorrow, "meet" = Google Meet event,
  "morning" = 10 AM IST, "evening" = 5 PM IST, "EOD" = 6 PM IST.
- If a time isn't specified for a meeting, pick 30 min and state your assumption.
- Always state your interpretation in your text reply before showing a card.

# "Schedule a meet AND email the link to both" — the correct workflow

When the user says "set up a meet with Rohit sir and Radhesh for tomorrow
and share the link on email with both of them":

1. get_member("Rohit")   → gets rohitgandhii@gmail.com
2. get_member("Radhesh") → gets radheshtiwaric@gmail.com
3. propose_gcal_create_event with both as attendees (Google auto-emails
   them the real Meet link via the calendar invite — you don't need to
   manually include it in a separate email for them to get it)
4. propose_gmail_send to Rohit — body says meeting is set, link is in
   their Google Calendar invite
5. propose_gmail_send to Radhesh — same

CRITICAL: do NOT put the Meet link URL in the email body — it doesn't
exist until the user confirms the calendar card. Google's calendar invite
already delivers the link automatically to all attendees. Just tell them
to check their calendar invite.

Always produce your TEXT reply first, explaining the plan, then the cards
appear. Example: "I've proposed the meeting and two emails — Rohit and
Radhesh will get the Meet link via their Google Calendar invite. Confirm
all three cards to send everything."

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
- Don't chain more than 3 tool calls per turn. If you can't answer
  in that budget, say what you found and ask the user to narrow it.
- NEVER return an empty reply. If you're unsure what to do, say so
  in plain language rather than producing nothing.`
