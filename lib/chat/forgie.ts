/**
 * Inline @Forgie for native chat.
 *
 * When a chat message mentions "@Forgie", we run the same Forgie pipeline the
 * web/WhatsApp assistant uses (context + system prompt + tools) via the
 * non-streaming generate() wrapper, then post the reply back into the thread as
 * a kind=FORGIE message. Supabase Realtime delivers it like any other message.
 */
import type { ModelMessage } from 'ai'
import type { Role } from '@prisma/client'

import { prisma } from '@/lib/db'
import { isAssistantEnabled } from '@/lib/llm/provider'
import { generate } from '@/lib/llm/generate'
import { buildSystemPrompt } from '@/lib/assistant/prompts'
import { getOrgId } from '@/lib/tenant-context'
import { getOrgIdentity } from '@/lib/org-branding'
import { buildForgieContext, renderContextBlock } from '@/lib/assistant/context'
import { buildAllToolsAsync, TOOL_USE_GUIDANCE } from '@/lib/assistant/ai-sdk-tools'
import { reserveRateLimit } from '@/lib/assistant/rate-limit'

// True when a message is addressed to Forgie (e.g. "@Forgie what's due?").
export function mentionsForgie(text: string): boolean {
  return /@forgie\b/i.test(text)
}

async function postForgie(conversationId: string, content: string) {
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: { organizationId: getOrgId(), conversationId, senderId: null, kind: 'FORGIE', type: 'TEXT', content },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
  ])
}

export async function replyAsForgieInChat(conversationId: string, triggerUserId: string) {
  if (!isAssistantEnabled()) return
  try {
    const rl = await reserveRateLimit(triggerUserId)
    if (!rl.allowed) {
      await postForgie(conversationId, `I'm hitting my rate limit — try again in ~${rl.resetInMinutes} min.`)
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: triggerUserId },
      select: { id: true, name: true, role: true },
    })
    if (!user) return

    const ctx = await buildForgieContext({ userId: user.id, userName: user.name, userRole: user.role })
    const brand = await getOrgIdentity(getOrgId())
    const systemPrompt = [
      buildSystemPrompt({
        id: user.id,
        name: user.name,
        role: user.role as Role,
        projectCount: ctx.myProjects.length,
        openTaskCount: ctx.myTasks.filter((t) => t.status !== 'DONE').length,
        overdueTaskCount: ctx.myTasks.filter((t) => t.isOverdue).length,
      }, brand),
      '',
      renderContextBlock(ctx),
      '',
      'You are replying inside a team chat thread. Keep replies concise and conversational — a sentence or two unless asked for detail.',
      '',
      TOOL_USE_GUIDANCE,
    ].join('\n')

    // Recent thread context (last ~10 text messages, oldest → newest).
    const recent = await prisma.chatMessage.findMany({
      where: { conversationId, deletedAt: null, type: 'TEXT' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { content: true, kind: true },
    })
    recent.reverse()
    const history: ModelMessage[] = recent.map((m) => ({
      role: m.kind === 'FORGIE' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }))

    const messages: ModelMessage[] = [{ role: 'system', content: systemPrompt }, ...history]
    const tools = await buildAllToolsAsync({ userId: user.id, role: user.role })
    const result = await generate(messages, { tools })
    const text = (result.text || '').trim()
    if (text) await postForgie(conversationId, text)
  } catch (err) {
    console.error('[chat] inline Forgie failed', err)
  }
}
