/**
 * POST /api/assistant/actions/execute
 *
 * Runs a write action previously proposed by Forgie, AFTER the user has
 * tapped Confirm in the UI. Re-validates everything server-side — never
 * trust what the LLM said directly.
 *
 * Body:
 *   {
 *     conversationId: string,
 *     action: 'create_task' | 'create_ticket' | 'update_task_status' | ...,
 *     args: { ... },
 *     token: string   // HMAC binding issued when the action was proposed
 *   }
 *
 * The `token` is re-derived server-side from (userId, action, args) and
 * constant-time-compared, so the args executed are provably the ones Forgie
 * proposed for this user — the client cannot tamper with them or invoke an
 * action that was never proposed. Per-tool RBAC still runs on top of that.
 *
 * Every successful or failed execution is recorded in AssistantAuditLog
 * so admins can see what Forgie did and trace any wrong writes back to
 * their origin conversation.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/auth'
import { authenticateActive } from '@/lib/authz'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { verifyActionToken } from '@/lib/assistant/action-token'

import { createTask, updateTaskStatus } from '@/lib/assistant/tools/tasks'
import { createTicket } from '@/lib/assistant/tools/tickets'
import {
  createProject,
  addProjectMember,
  setProjectLead,
} from '@/lib/assistant/tools/projects'
import { createRepo, createIssue, isGithubEnabled } from '@/lib/assistant/tools/github'
import { createEvent, cancelEvent, isUserGcalConnected } from '@/lib/assistant/tools/gcal'
import { sendMessage, isUserGmailEnabled } from '@/lib/assistant/tools/gmail'
import {
  createFolder,
  createDoc,
  isUserDriveEnabled,
} from '@/lib/assistant/tools/gdrive'
import {
  sendMessage as waSendMessage,
  createGroup as waCreateGroup,
  removeParticipants as waRemoveParticipants,
  leaveGroup as waLeaveGroup,
  isWhatsAppEnabled,
} from '@/lib/assistant/tools/whatsapp'

// ── WhatsApp recipient allow-list ────────────────────────────────────────────
// Forgie sends from the org-wide WA account, so any individual recipient must
// be a known teammate's number. Group JIDs (…@g.us) are allowed as-is (the
// bridge rejects groups it isn't in). This stops a prompt-injected or forged
// proposal from turning the org account into a spam/impersonation vector to
// arbitrary phone numbers.
function recipientDigits(v: string): string | null {
  if (v.endsWith('@g.us')) return null // group JID — allowed, not a phone number
  const at = v.indexOf('@')
  const digits = (at >= 0 ? v.slice(0, at) : v).replace(/\D/g, '')
  return digits.length >= 8 ? digits : '' // '' signals an invalid/too-short value
}

async function assertKnownRecipients(values: string[]): Promise<void> {
  const phones = values.map((v) => ({ v, d: recipientDigits(v) })).filter((x) => x.d !== null)
  if (phones.length === 0) return

  const invalid = phones.filter((x) => x.d === '')
  if (invalid.length) {
    throw new Error(`Not a valid WhatsApp recipient: ${invalid.map((x) => x.v).join(', ')}`)
  }

  const rows = await prisma.user.findMany({
    where: { whatsappNumber: { not: null }, isActive: true },
    select: { whatsappNumber: true },
  })
  const known = new Set(rows.map((r) => (r.whatsappNumber ?? '').replace(/\D/g, '')).filter(Boolean))

  const unknown = phones.filter((x) => !known.has(x.d as string))
  if (unknown.length) {
    throw new Error(
      `These numbers aren't linked to any teammate, so Forgie won't message them: ` +
        `${unknown.map((x) => x.v).join(', ')}. Add the number to the person's profile first.`,
    )
  }
}

// ─── Per-action arg schemas (server-side validation) ─────────────────────────

const CreateTaskArgs = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().min(1),
  assigneeId: z.string().min(1).optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  description: z.string().max(2000).optional(),
})

const CreateTicketArgs = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(2000),
  projectId: z.string().min(1),
})

const UpdateTaskStatusArgs = z.object({
  taskId: z.string().min(1),
  newStatus: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
})

const GhCreateRepoArgs = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(350).optional(),
  private: z.boolean().optional(),
  autoInit: z.boolean().optional(),
})

const GhCreateIssueArgs = z.object({
  repo: z.string().min(1),
  title: z.string().min(3).max(200),
  body: z.string().max(8000).optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
})

const GcalCreateEventArgs = z.object({
  title: z.string().min(1).max(200),
  start: z.string().min(1),
  end: z.string().min(1),
  attendees: z.array(z.string()).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  withMeetLink: z.boolean().optional(),
})

const GcalCancelEventArgs = z.object({
  eventId: z.string().min(1),
})

const GmailSendArgs = z.object({
  to: z.string().min(3),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  isHtml: z.boolean().optional(),
})

const DriveCreateFolderArgs = z.object({
  name: z.string().min(1).max(200),
  parentFolderId: z.string().optional(),
})

const DriveCreateDocArgs = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  format: z.enum(['text', 'gdoc']).optional(),
  parentFolderId: z.string().optional(),
})

const CreateProjectArgs = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  deadline: z.string().optional(),
  leadId: z.string().min(1),
  memberIds: z.array(z.string()).optional(),
})

const AddProjectMemberArgs = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
})

const SetProjectLeadArgs = z.object({
  projectId: z.string().min(1),
  newLeadId: z.string().min(1),
})

const WaSendMessageArgs = z.object({
  to: z.string().min(3),
  message: z.string().min(1).max(4000),
})

const WaCreateGroupArgs = z.object({
  name: z.string().min(1).max(100),
  participants: z.array(z.string().min(3)).min(1),
})

const WaRemoveParticipantsArgs = z.object({
  groupJid: z.string().min(1).refine((s) => s.endsWith('@g.us'), {
    message: 'groupJid must end with @g.us',
  }),
  participants: z.array(z.string().min(3)).min(1),
})

const WaLeaveGroupArgs = z.object({
  groupJid: z.string().min(1).refine((s) => s.endsWith('@g.us'), {
    message: 'groupJid must end with @g.us',
  }),
})

const Body = z.object({
  conversationId: z.string().min(1).nullable().optional(),
  action: z.enum([
    'create_task',
    'create_ticket',
    'update_task_status',
    'gh_create_repo',
    'gh_create_issue',
    'gcal_create_event',
    'gcal_cancel_event',
    'gmail_send',
    'drive_create_folder',
    'drive_create_doc',
    'create_project',
    'add_project_member',
    'set_project_lead',
    'wa_send_message',
    'wa_create_group',
    'wa_remove_participants',
    'wa_leave_group',
  ]),
  args: z.record(z.string(), z.unknown()),
  // HMAC token issued by /assistant/message when the action was proposed.
  // Binds (userId, action, args) so the client can't tamper with the args or
  // invoke a write action that was never proposed. See action-token.ts.
  token: z.string().min(1),
})

export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  // Re-validate role + isActive against the live DB (not just the JWT), so a
  // deactivated/demoted user can't execute privileged writes with a stale token.
  const caller = await authenticateActive(request)
  if (!caller) return errorResponse('Authentication required', 401)

  // ── Parse + validate body ────────────────────────────────────────────────
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('Request body must be valid JSON', 400)
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return errorResponse(`Invalid body: ${parsed.error.issues[0]?.message ?? 'malformed'}`, 400)
  }

  const { conversationId, action, args } = parsed.data

  // ── Verify the proposal binding (anti-tamper / anti-forge) ───────────────
  // The args we execute must be exactly what Forgie proposed for THIS user.
  // Without a valid token, this is either a tampered payload or a write action
  // that was never proposed — reject before doing anything.
  const binding = verifyActionToken(parsed.data.token, {
    userId: caller.userId,
    action,
    args,
  })
  if (!binding.ok) {
    const msg =
      binding.reason === 'expired'
        ? 'This confirmation has expired. Ask Forgie to propose the action again.'
        : 'This action could not be verified. Ask Forgie to propose it again.'
    return errorResponse(msg, 400)
  }

  // ── Confirm the conversation exists and belongs to this user ─────────────
  let validConvId: string | null = null
  if (conversationId) {
    const conv = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId: caller.userId },
      select: { id: true },
    })
    if (!conv) return errorResponse('Conversation not found', 404)
    validConvId = conv.id
  }

  // ── Dispatch + audit-log (always logged, success or failure) ─────────────
  try {
    let result: unknown
    switch (action) {
      case 'create_task': {
        const a = CreateTaskArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for create_task: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        const taskArgs = {
          ...a.data,
          dueDate: a.data.dueDate ? new Date(a.data.dueDate) : undefined,
        }
        result = await createTask(caller, taskArgs)
        break
      }
      case 'create_ticket': {
        const a = CreateTicketArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for create_ticket: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await createTicket(caller, a.data)
        break
      }
      case 'update_task_status': {
        const a = UpdateTaskStatusArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for update_task_status: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await updateTaskStatus(caller, a.data.taskId, a.data.newStatus)
        break
      }
      case 'gh_create_repo': {
        if (!isGithubEnabled()) throw new Error('GitHub is not configured on this server.')
        const a = GhCreateRepoArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for gh_create_repo: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await createRepo(a.data)
        break
      }
      case 'gh_create_issue': {
        if (!isGithubEnabled()) throw new Error('GitHub is not configured on this server.')
        const a = GhCreateIssueArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for gh_create_issue: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await createIssue(a.data)
        break
      }
      case 'gcal_create_event': {
        if (!(await isUserGcalConnected(caller.userId))) {
          throw new Error('You need to connect Google Calendar first (Profile → Connect Google).')
        }
        const a = GcalCreateEventArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for gcal_create_event: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await createEvent(caller.userId, a.data)
        break
      }
      case 'gcal_cancel_event': {
        if (!(await isUserGcalConnected(caller.userId))) {
          throw new Error('You need to connect Google Calendar first.')
        }
        const a = GcalCancelEventArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for gcal_cancel_event: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await cancelEvent(caller.userId, a.data)
        break
      }
      case 'gmail_send': {
        if (!(await isUserGmailEnabled(caller.userId))) {
          throw new Error('Gmail not connected. Reconnect Google from Profile to grant Gmail permissions.')
        }
        const a = GmailSendArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for gmail_send: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await sendMessage(caller.userId, a.data)
        break
      }
      case 'drive_create_folder': {
        if (!(await isUserDriveEnabled(caller.userId))) {
          throw new Error('Drive not connected. Reconnect Google from Profile to grant Drive permissions.')
        }
        const a = DriveCreateFolderArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for drive_create_folder: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await createFolder(caller.userId, a.data)
        break
      }
      case 'drive_create_doc': {
        if (!(await isUserDriveEnabled(caller.userId))) {
          throw new Error('Drive not connected. Reconnect Google from Profile to grant Drive permissions.')
        }
        const a = DriveCreateDocArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for drive_create_doc: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await createDoc(caller.userId, a.data)
        break
      }
      case 'create_project': {
        const a = CreateProjectArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for create_project: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        const projectArgs = {
          ...a.data,
          deadline: a.data.deadline ? new Date(a.data.deadline) : undefined,
        }
        if (projectArgs.deadline && isNaN(projectArgs.deadline.getTime())) {
          throw new Error('deadline must be a valid ISO date string')
        }
        result = await createProject(caller, projectArgs)
        break
      }
      case 'add_project_member': {
        const a = AddProjectMemberArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for add_project_member: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await addProjectMember(caller, a.data)
        break
      }
      case 'set_project_lead': {
        const a = SetProjectLeadArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for set_project_lead: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await setProjectLead(caller, a.data)
        break
      }
      case 'wa_send_message': {
        if (!isWhatsAppEnabled()) {
          throw new Error('WhatsApp bridge is not configured on this server.')
        }
        if (!isAdminRole(caller.role)) {
          throw new Error('Only admins can send WhatsApp messages from Forgie.')
        }
        const a = WaSendMessageArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for wa_send_message: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        await assertKnownRecipients([a.data.to])
        result = await waSendMessage(a.data)
        break
      }
      case 'wa_create_group': {
        if (!isWhatsAppEnabled()) {
          throw new Error('WhatsApp bridge is not configured on this server.')
        }
        if (!isAdminRole(caller.role)) {
          throw new Error('Only admins can create WhatsApp groups from Forgie.')
        }
        const a = WaCreateGroupArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for wa_create_group: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        await assertKnownRecipients(a.data.participants)
        result = await waCreateGroup(a.data)
        break
      }
      case 'wa_remove_participants': {
        if (!isWhatsAppEnabled()) {
          throw new Error('WhatsApp bridge is not configured on this server.')
        }
        if (!isAdminRole(caller.role)) {
          throw new Error('Only admins can remove WhatsApp participants from Forgie.')
        }
        const a = WaRemoveParticipantsArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for wa_remove_participants: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        await assertKnownRecipients(a.data.participants)
        result = await waRemoveParticipants(a.data)
        break
      }
      case 'wa_leave_group': {
        if (!isWhatsAppEnabled()) {
          throw new Error('WhatsApp bridge is not configured on this server.')
        }
        if (!isAdminRole(caller.role)) {
          throw new Error('Only admins can have Forgie leave WhatsApp groups.')
        }
        const a = WaLeaveGroupArgs.safeParse(args)
        if (!a.success) {
          throw new Error(`Invalid args for wa_leave_group: ${a.error.issues[0]?.message ?? 'malformed'}`)
        }
        result = await waLeaveGroup(a.data)
        break
      }
    }

    // Audit log — success path
    await prisma.assistantAuditLog.create({
      data: {
        userId: caller.userId,
        conversationId: validConvId,
        action,
        args: args as object,
        result: result as object,
        success: true,
      },
    }).catch(() => {/* audit failures must not block the response */})

    // If we have a conversation, drop a SYSTEM message recording the action
    // so the LLM has memory of what was just done for the next turn.
    if (validConvId) {
      await prisma.assistantMessage
        .create({
          data: {
            conversationId: validConvId,
            role: 'SYSTEM',
            content: `Action executed by user: ${action}\nResult: ${JSON.stringify(result).slice(0, 500)}`,
          },
        })
        .catch(() => {})
    }

    return successResponse({ action, success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    // Audit log — failure path
    await prisma.assistantAuditLog.create({
      data: {
        userId: caller.userId,
        conversationId: validConvId,
        action,
        args: args as object,
        success: false,
        error: message,
      },
    }).catch(() => {})

    console.error(`[POST /api/assistant/actions/execute] ${action}`, error)
    return errorResponse(`Action failed: ${message}`, 400)
  }
}
