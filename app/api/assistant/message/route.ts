/**
 * POST /api/assistant/message
 *
 * Send a message to Forgie. Body:
 *   { conversationId?: string, content: string }
 *
 * If conversationId is omitted, a new conversation is created.
 * Returns the assistant's reply + conversation metadata.
 *
 * Pipeline:
 *   1. Auth + rate limit
 *   2. Cache lookup (5-min TTL on common queries)
 *   3. Load or create conversation, save user message
 *   4. Build grounded context (user's projects/tasks/tickets)
 *   5. Compose system prompt with personality + context
 *   6. Call generate() — multi-provider fallback
 *   7. Save assistant message + usage stats
 *   8. Return reply
 */

import { type NextRequest } from 'next/server'
import type { ModelMessage } from 'ai'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { generate } from '@/lib/llm/generate'
import { isAssistantEnabled } from '@/lib/llm/provider'
import { buildSystemPrompt } from '@/lib/assistant/prompts'
import { buildForgieContext, renderContextBlock } from '@/lib/assistant/context'
import { checkRateLimit, recordUsage } from '@/lib/assistant/rate-limit'
import { lookupCache, storeCache, maybeSweepCache } from '@/lib/assistant/cache'

const MAX_HISTORY_MESSAGES = 10  // last 10 turns kept in context

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ────────────────────────────────────────────────────────────
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired session', 401)

    // ── 1b. Feature flag ───────────────────────────────────────────────────
    if (!isAssistantEnabled()) {
      return errorResponse(
        'The assistant is not configured. Ask an admin to enable Forgie.',
        503,
      )
    }

    // ── 2. Parse body ──────────────────────────────────────────────────────
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

    // ── 3. Rate limit (soft) ───────────────────────────────────────────────
    const rl = await checkRateLimit(claims.userId)
    if (!rl.allowed) {
      return successResponse({
        conversationId: conversationId,
        assistantMessage: {
          role: 'ASSISTANT',
          content: `You've hit your hourly message limit (${rl.limit}). Resets in about ${rl.resetInMinutes} minute(s). Take a break.`,
          provider: null,
          fallback: true,
        },
      })
    }

    // ── 4. Load user (we need their name + role) ───────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, name: true, role: true, isActive: true },
    })
    if (!user || !user.isActive) return errorResponse('User not found or inactive', 404)

    // ── 5. Load or create conversation ─────────────────────────────────────
    let conversation = conversationId
      ? await prisma.assistantConversation.findFirst({
          where: { id: conversationId, userId: user.id },
        })
      : null

    if (!conversation) {
      conversation = await prisma.assistantConversation.create({
        data: { userId: user.id },
      })
    }

    // ── 6. Save user message ───────────────────────────────────────────────
    await prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content,
      },
    })

    // ── 7. Cache lookup (only for fresh conversations or simple queries) ───
    // Heuristic: only cache if it's a single-turn query (no prior history)
    // This avoids serving stale responses in mid-conversation context.
    const priorMessageCount = await prisma.assistantMessage.count({
      where: { conversationId: conversation.id, role: { in: ['USER', 'ASSISTANT'] } },
    })

    if (priorMessageCount <= 1) {
      const cached = await lookupCache({ userId: user.id, role: user.role, query: content })
      if (cached) {
        await prisma.assistantMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'ASSISTANT',
            content: cached.response,
            provider: 'cache',
            model: 'cache',
          },
        })
        return successResponse({
          conversationId: conversation.id,
          assistantMessage: {
            role: 'ASSISTANT',
            content: cached.response,
            provider: 'cache',
            cached: true,
            cacheHits: cached.hits + 1,
          },
        })
      }
    }

    // ── 8. Build grounded context + system prompt ──────────────────────────
    const forgieCtx = await buildForgieContext({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
    })

    const systemPrompt = [
      buildSystemPrompt({
        id: user.id,
        name: user.name,
        role: user.role,
        projectCount: forgieCtx.myProjects.length,
        openTaskCount: forgieCtx.myTasks.filter((t) => t.status !== 'DONE').length,
        overdueTaskCount: forgieCtx.myTasks.filter((t) => t.isOverdue).length,
      }),
      '',
      renderContextBlock(forgieCtx),
    ].join('\n')

    // ── 9. Load conversation history ────────────────────────────────────────
    const history = await prisma.assistantMessage.findMany({
      where: {
        conversationId: conversation.id,
        role: { in: ['USER', 'ASSISTANT'] },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    })
    history.reverse()  // chronological

    const messages: ModelMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
    ]

    // ── 10. Call LLM with multi-provider fallback ──────────────────────────
    const result = await generate(messages)

    // ── 11. Persist assistant message ──────────────────────────────────────
    await prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: result.text,
        provider: result.provider ?? null,
        model: result.model ?? null,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
      },
    })

    // ── 12. Auto-title the conversation on first exchange ──────────────────
    if (!conversation.title && priorMessageCount === 0) {
      const autoTitle = content.length > 60 ? content.slice(0, 57) + '...' : content
      await prisma.assistantConversation
        .update({ where: { id: conversation.id }, data: { title: autoTitle } })
        .catch(() => {})
    }

    // ── 13. Cache + usage (best-effort, non-blocking) ──────────────────────
    if (priorMessageCount === 0 && result.provider && !result.fallback) {
      void storeCache({
        userId: user.id,
        role: user.role,
        query: content,
        response: result.text,
      }).catch(() => {})
    }

    if (result.provider) {
      void recordUsage({
        userId: user.id,
        provider: result.provider,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
      }).catch(() => {})
    }

    void maybeSweepCache()

    // ── 14. Return ─────────────────────────────────────────────────────────
    return successResponse({
      conversationId: conversation.id,
      assistantMessage: {
        role: 'ASSISTANT',
        content: result.text,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        fallback: result.fallback,
      },
    })
  } catch (error) {
    console.error('[POST /api/assistant/message]', error)
    return errorResponse('Forgie hit a snag. Try again in a moment.', 500)
  }
}
