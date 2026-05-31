/**
 * POST /api/assistant/message
 *
 * Send a message to Forgie. Body:
 *   { conversationId?: string, content: string }
 *
 * Returns a streaming NDJSON response (Content-Type: application/x-ndjson).
 * Frames the client should expect, one per line:
 *
 *   {"type":"start","conversationId":"..."}            // first, always
 *   {"type":"text","delta":"..."}                       // token chunks
 *   {"type":"done","provider":"...","model":"...",     // terminal,
 *      "pendingActions":[...],"latencyMs":N, ...}        //   with metadata
 *
 * Special cases that still produce a streaming response:
 *   - Cache hit:        one "text" frame with the cached reply + done frame
 *   - Rate limit hit:   one "text" frame with the friendly limit message
 *   - All providers exhausted: one "text" frame with canned message + done
 *   - Auth failure:     HTTP 401 (not streamed)
 *   - Validation error: HTTP 400 (not streamed)
 *
 * Keeps the client code simple — it always reads NDJSON.
 */

import { type NextRequest } from 'next/server'
import type { ModelMessage } from 'ai'
import type { Role } from '@prisma/client'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'
import { isAssistantEnabled } from '@/lib/llm/provider'
import { startStream, consumeStream } from '@/lib/llm/stream'
import { buildSystemPrompt } from '@/lib/assistant/prompts'
import { buildForgieContext, renderContextBlock } from '@/lib/assistant/context'
import { checkRateLimit, recordUsage } from '@/lib/assistant/rate-limit'
import { lookupCache, storeCache, maybeSweepCache } from '@/lib/assistant/cache'
import { buildAllToolsAsync, TOOL_USE_GUIDANCE } from '@/lib/assistant/ai-sdk-tools'

const MAX_HISTORY_MESSAGES = 10

export async function POST(request: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const claims = verifyToken(token)
  if (!claims) return errorResponse('Invalid or expired session', 401)

  // ── 1b. Feature flag ─────────────────────────────────────────────────────
  if (!isAssistantEnabled()) {
    return errorResponse(
      'The assistant is not configured. Ask an admin to enable Forgie.',
      503,
    )
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Request body must be valid JSON', 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('Request body must be a JSON object', 400)
  }
  const { conversationId: convIdRaw, content: contentRaw } = body as Record<string, unknown>
  if (typeof contentRaw !== 'string' || contentRaw.trim().length === 0) {
    return errorResponse('content is required', 400)
  }
  if (contentRaw.length > 4000) {
    return errorResponse('content must not exceed 4000 characters', 400)
  }
  const content = contentRaw.trim()
  const conversationId = typeof convIdRaw === 'string' && convIdRaw.length > 0 ? convIdRaw : null

  // ── 3. User load ─────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, name: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return errorResponse('User not found or inactive', 404)

  // ── 4. Rate limit (soft) ─────────────────────────────────────────────────
  const rl = await checkRateLimit(user.id)

  // ── 5. Load or create conversation ───────────────────────────────────────
  let conversation = conversationId
    ? await prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId: user.id },
      })
    : null

  if (!conversation) {
    conversation = await prisma.assistantConversation.create({ data: { userId: user.id } })
  }

  // ── 6. Save user message ─────────────────────────────────────────────────
  await prisma.assistantMessage.create({
    data: { conversationId: conversation.id, role: 'USER', content },
  })

  // ─── Build a streaming response ──────────────────────────────────────────
  // From this point on, errors are sent as NDJSON 'error' frames; we never
  // throw out of the stream once it's running.

  const stream = buildResponseStream({
    user,
    conversationId: conversation.id,
    content,
    rateLimit: rl,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',  // disable nginx-style buffering if any
    },
  })
}

// ─── Stream builder ──────────────────────────────────────────────────────────

interface BuildArgs {
  user: { id: string; name: string; role: string }
  conversationId: string
  content: string
  rateLimit: { allowed: boolean; limit: number; resetInMinutes: number }
}

function buildResponseStream(args: BuildArgs): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const write = (controller: ReadableStreamDefaultController<Uint8Array>, frame: object) => {
    controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'))
  }

  return new ReadableStream({
    async start(controller) {
      try {
        // First frame: stream metadata
        write(controller, { type: 'start', conversationId: args.conversationId })

        // ── Rate-limit gate ────────────────────────────────────────────────
        if (!args.rateLimit.allowed) {
          const msg = `You've hit your hourly message limit (${args.rateLimit.limit}). Resets in about ${args.rateLimit.resetInMinutes} minute(s). Take a break.`
          write(controller, { type: 'text', delta: msg })
          write(controller, {
            type: 'done',
            provider: null,
            model: null,
            fallback: true,
            latencyMs: 0,
            pendingActions: [],
            toolsUsed: [],
          })
          // Persist assistant message
          await persistAssistant(args.conversationId, msg, {
            provider: null,
            fallback: true,
          })
          controller.close()
          return
        }

        // ── Cache check (only on fresh conversations) ──────────────────────
        const priorCount = await prisma.assistantMessage.count({
          where: { conversationId: args.conversationId, role: { in: ['USER', 'ASSISTANT'] } },
        })
        if (priorCount <= 1) {
          const cached = await lookupCache({
            userId: args.user.id,
            role: args.user.role,
            query: args.content,
          })
          if (cached) {
            write(controller, { type: 'text', delta: cached.response })
            write(controller, {
              type: 'done',
              provider: 'cache',
              model: 'cache',
              fallback: false,
              latencyMs: 0,
              pendingActions: [],
              toolsUsed: [],
              cached: true,
            })
            await persistAssistant(args.conversationId, cached.response, {
              provider: 'cache',
              model: 'cache',
            })
            controller.close()
            return
          }
        }

        // ── Build context + prompt ─────────────────────────────────────────
        const forgieCtx = await buildForgieContext({
          userId: args.user.id,
          userName: args.user.name,
          userRole: args.user.role,
        })

        const systemPrompt = [
          buildSystemPrompt({
            id: args.user.id,
            name: args.user.name,
            role: args.user.role as Role,
            projectCount: forgieCtx.myProjects.length,
            openTaskCount: forgieCtx.myTasks.filter((t) => t.status !== 'DONE').length,
            overdueTaskCount: forgieCtx.myTasks.filter((t) => t.isOverdue).length,
          }),
          '',
          renderContextBlock(forgieCtx),
          '',
          TOOL_USE_GUIDANCE,
        ].join('\n')

        // ── Load conversation history ──────────────────────────────────────
        const history = await prisma.assistantMessage.findMany({
          where: {
            conversationId: args.conversationId,
            role: { in: ['USER', 'ASSISTANT'] },
          },
          orderBy: { createdAt: 'desc' },
          take: MAX_HISTORY_MESSAGES,
          select: { role: true, content: true },
        })
        history.reverse()

        const messages: ModelMessage[] = [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({
            role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
            content: m.content,
          })),
        ]

        // ── Stream! ────────────────────────────────────────────────────────
        const allTools = await buildAllToolsAsync({
          userId: args.user.id,
          role: args.user.role,
        })
        const start = await startStream(messages, { tools: allTools })

        if (!start.success) {
          const fallbackMsg = pickFallbackMessage(start.reason)
          write(controller, { type: 'text', delta: fallbackMsg })
          write(controller, {
            type: 'done',
            provider: null,
            model: null,
            fallback: true,
            latencyMs: 0,
            pendingActions: [],
            toolsUsed: [],
          })
          await persistAssistant(args.conversationId, fallbackMsg, {
            provider: null,
            fallback: true,
          })
          controller.close()
          return
        }

        // Drain the text stream, emitting frames as they arrive
        let fullText = ''
        const metadata = await consumeStream(start, (delta) => {
          fullText += delta
          write(controller, { type: 'text', delta })
        }).catch((err) => {
          // Graceful tail: stream was committed, but errored partway.
          // Don't throw — emit an end-of-stream marker indicating partial result.
          console.error('[message-stream] mid-stream error:', err)
          return null
        })

        // ── Compute pending actions from tool calls ────────────────────────
        const pendingActions = (metadata?.toolCalls ?? [])
          .filter((c) => c.name.startsWith('propose_') && !c.errored)
          .map((c) => {
            const r = c.result as { proposed?: boolean; action?: string; args?: Record<string, unknown> } | null
            if (!r || !r.action || !r.args) return null
            return {
              actionId: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
              action: r.action,
              args: r.args,
              label: buildActionLabel(r.action, r.args, forgieCtx),
            }
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)

        // ── Persist assistant message ──────────────────────────────────────
        await persistAssistant(args.conversationId, fullText, {
          provider: metadata?.provider ?? null,
          model: metadata?.model ?? null,
          inputTokens: metadata?.inputTokens,
          outputTokens: metadata?.outputTokens,
          latencyMs: metadata?.latencyMs,
          toolCalls: metadata?.toolCalls,
        })

        // ── Auto-title on first exchange ───────────────────────────────────
        if (priorCount === 0) {
          const autoTitle =
            args.content.length > 60 ? args.content.slice(0, 57) + '...' : args.content
          await prisma.assistantConversation
            .update({ where: { id: args.conversationId }, data: { title: autoTitle } })
            .catch(() => {})
        }

        // ── Cache + usage (best-effort, non-blocking) ──────────────────────
        if (priorCount === 0 && metadata?.provider && metadata && fullText) {
          void storeCache({
            userId: args.user.id,
            role: args.user.role,
            query: args.content,
            response: fullText,
          }).catch(() => {})
        }
        if (metadata?.provider) {
          void recordUsage({
            userId: args.user.id,
            provider: metadata.provider,
            inputTokens: metadata.inputTokens ?? 0,
            outputTokens: metadata.outputTokens ?? 0,
          }).catch(() => {})
        }
        void maybeSweepCache()

        // ── Done frame ─────────────────────────────────────────────────────
        write(controller, {
          type: 'done',
          provider: metadata?.provider ?? null,
          model: metadata?.model ?? null,
          fallback: false,
          latencyMs: metadata?.latencyMs ?? null,
          pendingActions,
          toolsUsed: metadata?.toolCalls.map((c) => c.name) ?? [],
        })
        controller.close()
      } catch (err) {
        console.error('[POST /api/assistant/message] stream init error:', err)
        try {
          write(controller, {
            type: 'error',
            error: 'Forgie hit a snag. Try again in a moment.',
          })
        } catch { /* controller may be closed */ }
        try { controller.close() } catch { /* idempotent */ }
      }
    },
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function persistAssistant(
  conversationId: string,
  content: string,
  meta: {
    provider?: string | null
    model?: string | null
    inputTokens?: number | null
    outputTokens?: number | null
    latencyMs?: number | null
    fallback?: boolean
    toolCalls?: unknown
  },
) {
  await prisma.assistantMessage
    .create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content,
        provider: meta.provider ?? null,
        model: meta.model ?? null,
        inputTokens: meta.inputTokens ?? null,
        outputTokens: meta.outputTokens ?? null,
        latencyMs: meta.latencyMs ?? null,
        toolCalls: meta.toolCalls
          ? (meta.toolCalls as object)
          : undefined,
      },
    })
    .catch((err) => {
      console.warn('[persistAssistant] failed:', err)
    })
}

function pickFallbackMessage(reason: string): string {
  switch (reason) {
    case 'all_keys_cooling_down':
    case 'all_attempts_exhausted':
      return "I'm getting a lot of traffic right now. Give me a moment and try again — should be back to normal shortly."
    case 'assistant_disabled':
      return 'Forgie is currently disabled. Ask an admin to enable it.'
    default:
      return 'Hit a snag with all my upstream providers. Try again in a minute.'
  }
}

function buildActionLabel(
  action: string,
  args: Record<string, unknown>,
  ctx: { myProjects: Array<{ id: string; name: string }> },
): string {
  const projectName = typeof args.projectId === 'string'
    ? ctx.myProjects.find((p) => p.id === args.projectId)?.name ?? args.projectId
    : undefined

  switch (action) {
    case 'create_task': {
      const title = typeof args.title === 'string' ? args.title : 'New task'
      const due = typeof args.dueDate === 'string' ? ` (due ${args.dueDate.slice(0, 10)})` : ''
      const priority = typeof args.priority === 'string' && args.priority !== 'MEDIUM'
        ? ` · ${args.priority}` : ''
      return `Create task "${title}" in ${projectName ?? 'project'}${due}${priority}`
    }
    case 'create_ticket': {
      const title = typeof args.title === 'string' ? args.title : 'New ticket'
      return `Raise ticket "${title}" in ${projectName ?? 'project'}`
    }
    case 'update_task_status': {
      const status = typeof args.newStatus === 'string' ? args.newStatus : '?'
      return `Mark task as ${status}`
    }
    case 'gh_create_repo': {
      const name = typeof args.name === 'string' ? args.name : 'new-repo'
      const visibility = args.private === false ? 'public' : 'private'
      return `Create GitHub repo "${name}" (${visibility})`
    }
    case 'gh_create_issue': {
      const title = typeof args.title === 'string' ? args.title : 'New issue'
      const repo = typeof args.repo === 'string' ? args.repo : 'repo'
      return `File GitHub issue "${title}" on ${repo}`
    }
    case 'gcal_create_event': {
      const title = typeof args.title === 'string' ? args.title : 'New meeting'
      const start = typeof args.start === 'string' ? formatWhen(args.start) : ''
      const attendeeCount = Array.isArray(args.attendees) ? args.attendees.length : 0
      const withWho = attendeeCount > 0 ? ` with ${attendeeCount} attendee${attendeeCount === 1 ? '' : 's'}` : ''
      return `Schedule "${title}"${start ? ` ${start}` : ''}${withWho}`
    }
    case 'gcal_cancel_event': {
      return `Cancel calendar event`
    }
    case 'gmail_send': {
      const to = typeof args.to === 'string' ? args.to : ''
      const subj = typeof args.subject === 'string' ? args.subject : '(no subject)'
      const recipients = to.split(',').map((s) => s.trim()).filter(Boolean)
      const recipientLabel = recipients.length === 1
        ? recipients[0]
        : `${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`
      return `Send email "${subj}" to ${recipientLabel}`
    }
    case 'drive_create_folder': {
      const name = typeof args.name === 'string' ? args.name : 'New folder'
      return `Create Drive folder "${name}"`
    }
    case 'drive_create_doc': {
      const name = typeof args.name === 'string' ? args.name : 'New file'
      const format = args.format === 'gdoc' ? 'Google Doc' : 'text file'
      return `Create ${format} "${name}" in Drive`
    }
    default:
      return action
  }
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
