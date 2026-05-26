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
 *     action: 'create_task' | 'create_ticket' | 'update_task_status',
 *     args: { ... }
 *   }
 *
 * Every successful or failed execution is recorded in AssistantAuditLog
 * so admins can see what Forgie did and trace any wrong writes back to
 * their origin conversation.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

import { createTask, updateTaskStatus } from '@/lib/assistant/tools/tasks'
import { createTicket } from '@/lib/assistant/tools/tickets'

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

const Body = z.object({
  conversationId: z.string().min(1).nullable().optional(),
  action: z.enum(['create_task', 'create_ticket', 'update_task_status']),
  args: z.record(z.string(), z.unknown()),
})

export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

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

  // ── Confirm the conversation exists and belongs to this user ─────────────
  let validConvId: string | null = null
  if (conversationId) {
    const conv = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId: claims.userId },
      select: { id: true },
    })
    if (!conv) return errorResponse('Conversation not found', 404)
    validConvId = conv.id
  }

  const caller = { userId: claims.userId, role: claims.role }

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
    }

    // Audit log — success path
    await prisma.assistantAuditLog.create({
      data: {
        userId: claims.userId,
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
        userId: claims.userId,
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
