/**
 * Forgie WhatsApp inbound handler (P11.4).
 *
 * Receives a parsed incoming-message payload from the bridge and:
 *   1. Resolves the sender to a User by matching whatsappNumber.
 *   2. Decides whether to reply (DMs always; groups only when "forgie"
 *      appears in the message).
 *   3. Gets or creates a dedicated WHATSAPP-channel AssistantConversation
 *      for that user so Forgie remembers context across WA messages.
 *   4. Runs the same generate() pipeline as the web flow, but with:
 *        - read-only tools (no propose_*, no Confirm UI in WhatsApp)
 *        - a WhatsApp-formatting addendum on the system prompt
 *   5. Sends the LLM's reply back over the bridge, with an
 *      "AI-generated" disclaimer footer appended.
 *
 * Auth model: only users with a matching whatsappNumber in the DB get
 * replies. Unknown senders are logged and silently ignored — we don't
 * want random numbers triggering LLM spend.
 */

import type { Role, AssistantChannel } from '@prisma/client'
import type { ModelMessage, ToolSet } from 'ai'

import { prisma } from '@/lib/db'
import { generate } from '@/lib/llm/generate'

import { buildForgieContext, renderContextBlock } from './context'
import { buildSystemPrompt } from './prompts'
import { getOrgId } from '@/lib/tenant-context'
import { getOrgIdentity } from '@/lib/org-branding'
import { buildAllToolsAsync } from './ai-sdk-tools'
import { reserveRateLimit, recordUsage } from './rate-limit'
import { sendWhatsappMessage } from '@/lib/whatsapp/bridge'

// Kept modest for WhatsApp: combined with the trimmed WA tool guidance this
// keeps the request under Groq's free-tier 12k tokens/minute cap so the fast
// provider stays usable instead of always falling through to Gemini.
const MAX_HISTORY_MESSAGES = 6

// Italics in WhatsApp use _underscores_. Two newlines separates it from
// the model's reply so it reads like a footer, not the last sentence.
export const WA_DISCLAIMER =
  '\n\n_This is an AI-generated reply and may contain mistakes — verify anything important._'

// Compact tool guidance for WhatsApp. The web chat's full TOOL_USE_GUIDANCE
// is ~1.8k tokens and is mostly scheduling/email/group-send workflows for
// propose_* tools — which are STRIPPED over WhatsApp (readOnly). Sending it
// pushed the WA request to ~12k tokens and tripped Groq's free-tier 12k TPM
// cap (413), so every WA reply fell through to Gemini. This keeps only the
// bits that matter when answering from read tools + grounded context.
const WA_TOOL_GUIDANCE = `# Using tools over WhatsApp

The grounded-data block above already holds this user's projects, tasks,
tickets (and, for admins, an org snapshot). Answer common questions
straight from it — don't call a tool for something already loaded.

Call a READ tool only for something NOT in that snapshot: a specific
teammate (get_member), a project they're not on, a ticket/task filter,
or a GitHub lookup. Strip honorifics/nicknames before searching a name
("Rohit sir" → search "Rohit"). One well-chosen call beats three; never
chain more than 3. If a lookup is empty, say so — don't invent. Never
return an empty reply.`

// Appended to the system prompt so the model knows it's writing for
// WhatsApp instead of the web chat UI.
const WA_REPLY_GUIDANCE = `# WhatsApp reply format

You are replying via WhatsApp, not the web app. Constraints:
- Keep replies SHORT — 1-3 sentences whenever possible. People are on phones.
- No markdown headers, no bullet lists, no code fences. Plain prose only.
- Bold: *single asterisks*. Italic: _underscores_. Nothing else renders.
- Don't write "Confirm to proceed" prompts — there is no Confirm UI here.
- DO NOT call propose_* tools. If the user asks to create/edit/schedule
  anything, tell them to do it in the web app at /dashboard. You can
  still use READ tools (list_tasks, get_member, etc.) to answer questions.
- An "AI-generated reply" disclaimer is auto-appended to your message —
  don't add one yourself.`

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IncomingWaMessage {
  from: string        // sender JID — e.g. "919876543210@c.us"
  chatJid: string     // chat JID — same as `from` for DMs, group JID for groups
  body: string
  isGroup: boolean
  pushName: string
  timestamp: number
  msgId?: string      // WhatsApp message id — used for idempotency
}

// Idempotency guard. The bridge dedupes in-process, but a bridge restart can
// replay a message after its in-memory set is wiped. This in-memory LRU lives
// in the long-running main-app process (a different service from the bridge),
// so it catches restart-replays and prevents a second AI reply + LLM charge.
// Best-effort by design: single-instance memory; a multi-instance deploy would
// need a persisted dedupe key (tracked in SECURITY_TODO.md).
const recentMsgIds = new Set<string>()
const MAX_SEEN_IDS = 1000

function alreadyHandled(msgId?: string): boolean {
  if (!msgId) return false
  if (recentMsgIds.has(msgId)) return true
  recentMsgIds.add(msgId)
  if (recentMsgIds.size > MAX_SEEN_IDS) {
    // Set preserves insertion order — evict the oldest.
    const oldest = recentMsgIds.values().next().value
    if (oldest !== undefined) recentMsgIds.delete(oldest)
  }
  return false
}

export interface HandleResult {
  processed: boolean       // did we send a reply?
  reason: string           // 'replied' | 'unknown-sender' | 'group-not-mentioned' | 'rate-limited' | 'empty-body' | 'send-failed' | 'pipeline-error' | ...
  conversationId?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Bridge sends JIDs like "919876543210@c.us" — extract digits, return
// E.164 form ("+919876543210") to match how whatsappNumber is stored.
function jidToE164(jid: string): string | null {
  const digits = jid.split('@')[0]?.replace(/\D/g, '') ?? ''
  if (!digits || digits.length < 10) return null
  return '+' + digits
}

// In a group, the message often contains "@<number>" tokens. Strip those
// so the LLM doesn't see noise. Also trim the literal word "forgie" if it
// leads the message — feels more natural to the model.
function cleanGroupBody(body: string): string {
  let s = body.replace(/@\d{10,15}/g, ' ').trim()
  s = s.replace(/^forgie[\s,:!]+/i, '').trim()
  return s || body  // never return empty
}

// READ-only filter for the WA tool set. We strip every propose_* tool
// (write actions) because there's no Confirm card UI in WhatsApp.
function readOnly(tools: ToolSet): ToolSet {
  const out: ToolSet = {}
  for (const [name, t] of Object.entries(tools)) {
    if (!name.startsWith('propose_')) out[name] = t
  }
  return out
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handleIncomingWhatsapp(
  msg: IncomingWaMessage,
): Promise<HandleResult> {
  // Idempotency — drop a message we've already handled (e.g. bridge restart
  // replay) before doing any LLM work, so the user never gets a double reply.
  if (alreadyHandled(msg.msgId)) {
    return { processed: false, reason: 'duplicate' }
  }

  const e164 = jidToE164(msg.from)
  if (!e164) return { processed: false, reason: 'bad-jid' }

  // Step 1 — find the User by whatsappNumber. Exact match because we
  // normalised at write-time (Profile UI and the seed script both store
  // canonical "+<digits>"). Falls back to `endsWith` only if exact misses,
  // to catch any legacy rows entered before the normaliser shipped.
  let user = await prisma.user.findFirst({
    where: { isActive: true, whatsappNumber: e164 },
    select: { id: true, name: true, role: true },
  })
  if (!user) {
    // Some pre-seed rows may store the bare digits (no leading "+"). Match that
    // exact form only — a loose `endsWith` could resolve to the WRONG user
    // whose longer number merely ends with these digits.
    const digits = e164.slice(1)
    user = await prisma.user.findFirst({
      where: { isActive: true, whatsappNumber: digits },
      select: { id: true, name: true, role: true },
    })
  }
  if (!user) {
    console.log(`[wa-handler] unknown sender ${e164} ("${msg.pushName}") — ignoring`)
    return { processed: false, reason: 'unknown-sender' }
  }

  // Step 2 — group gating. Only reply when the user actually addresses
  // Forgie ("forgie" appears anywhere, case-insensitive) — otherwise
  // we'd reply to every group message ever sent.
  if (msg.isGroup && !/forgie/i.test(msg.body)) {
    return { processed: false, reason: 'group-not-mentioned' }
  }

  const userBody = msg.isGroup ? cleanGroupBody(msg.body) : msg.body.trim()
  if (!userBody) return { processed: false, reason: 'empty-body' }

  // Step 3 — rate limit (shared per-user budget with the web chat).
  const rl = await reserveRateLimit(user.id)
  if (!rl.allowed) {
    await safeSend(
      msg.chatJid,
      `Hitting my rate limit — try again in ~${rl.resetInMinutes} min.${WA_DISCLAIMER}`,
    )
    return { processed: true, reason: 'rate-limited' }
  }

  // Step 4 — get or create the WA conversation for this user.
  let conversation = await prisma.assistantConversation.findFirst({
    where: {
      userId: user.id,
      channel: 'WHATSAPP' as AssistantChannel,
      isArchived: false,
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (!conversation) {
    conversation = await prisma.assistantConversation.create({
      data: {
        userId: user.id,
        channel: 'WHATSAPP' as AssistantChannel,
        title: msg.isGroup
          ? `WhatsApp group — ${user.name}`
          : `WhatsApp — ${user.name}`,
      },
      select: { id: true },
    })
  }

  // Step 5 — persist the incoming user message.
  await prisma.assistantMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'USER',
      content: userBody,
    },
  })

  // Steps 6-10 — build context, call the LLM, persist, and reply.
  //
  // Durability guarantee: WhatsApp inbound is fire-and-forget — the bridge
  // does NOT retry the webhook (see reference-wa-bridge). So if anything in
  // this section throws (context build, tool setup, a DB hiccup), the user's
  // message stays persisted as a USER row but no reply ever goes out — a
  // silent drop, exactly the failure the web chat route guards against with
  // its "never leave an empty bubble" safety net. We wrap the whole pipeline
  // so ANY unexpected failure still sends the user a short apology telling
  // them to retry, instead of leaving them hanging.
  //
  // Note: generate() itself does NOT throw on provider exhaustion — it
  // returns a canned (fallback:true) result — so a plain LLM outage already
  // produces a "try again" reply and won't reach this catch.
  try {
    // Step 6 — build context + system prompt + tools.
    const context = await buildForgieContext({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
    })

    const brand = await getOrgIdentity(getOrgId())
    const systemPrompt = [
      buildSystemPrompt({ id: user.id, name: user.name, role: user.role as Role }, brand),
      '',
      renderContextBlock(context),
      '',
      WA_TOOL_GUIDANCE,
      '',
      WA_REPLY_GUIDANCE,
    ].join('\n')

    const allTools = await buildAllToolsAsync({ userId: user.id, role: user.role })
    const tools = readOnly(allTools)

    // Step 7 — load the last few exchanges so Forgie has memory.
    const history = await prisma.assistantMessage.findMany({
      where: {
        conversationId: conversation.id,
        role: { in: ['USER', 'ASSISTANT'] },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    })
    const ordered = history.reverse()

    const messages: ModelMessage[] = [
      { role: 'system', content: systemPrompt },
      ...ordered.map((m) => ({
        role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Step 8 — call the LLM.
    const result = await generate(messages, { tools })

    // Step 9 — persist the assistant message + usage. Bookkeeping mistakes
    // shouldn't block the reply going out, so .catch() each one.
    await prisma.assistantMessage
      .create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: result.text,
          provider: result.provider ?? undefined,
          model: result.model ?? undefined,
          inputTokens: result.inputTokens ?? undefined,
          outputTokens: result.outputTokens ?? undefined,
          latencyMs: result.latencyMs,
          ...(result.toolCalls.length && {
            toolCalls: JSON.parse(JSON.stringify(result.toolCalls)),
          }),
        },
      })
      .catch((e) => console.error('[wa-handler] save assistant msg failed:', e))

    await prisma.assistantConversation
      .update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })
      .catch(() => {})

    if (result.provider && (result.inputTokens || result.outputTokens)) {
      await recordUsage({
        userId: user.id,
        provider: result.provider,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
      }).catch(() => {})
    }

    // Step 10 — send the reply over the bridge, with disclaimer.
    const replyBody = (result.text.trim() || "I didn't catch that — try again?") + WA_DISCLAIMER
    const sent = await safeSend(msg.chatJid, replyBody)
    if (!sent) return { processed: false, reason: 'send-failed', conversationId: conversation.id }

    return { processed: true, reason: 'replied', conversationId: conversation.id }
  } catch (err) {
    // Unexpected failure in the reply pipeline (context build, tool setup,
    // DB, etc.). The user's message was already accepted — don't leave them
    // with silence. Send a short apology so they know to retry.
    //
    // We deliberately DON'T persist an assistant turn here: keeping the
    // conversation's last message as the USER's question means it shows up
    // as "unreplied" (last role = USER) and stays recoverable for a future
    // replay, instead of being masked by an apology assistant row.
    console.error(
      '[wa-handler] reply pipeline failed:',
      err instanceof Error ? err.message : err,
    )
    await safeSend(
      msg.chatJid,
      `Sorry — something went wrong on my end and I couldn't answer that. Please send it again in a moment.${WA_DISCLAIMER}`,
    )
    return { processed: false, reason: 'pipeline-error', conversationId: conversation.id }
  }
}

// Wrap bridge send so a transient failure doesn't take down the handler.
async function safeSend(to: string, message: string): Promise<boolean> {
  try {
    await sendWhatsappMessage({ to, message })
    return true
  } catch (err) {
    console.error('[wa-handler] bridge send failed:', err instanceof Error ? err.message : err)
    return false
  }
}
