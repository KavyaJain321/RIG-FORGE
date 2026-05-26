/**
 * High-level generate() that wraps the provider abstraction with
 * automatic fallback. The route layer calls this; it handles:
 *
 *   - Selecting a provider/key pair
 *   - Catching 429s, marking the key cool, retrying with the next
 *   - Logging which provider+model actually served the response
 *   - Returning a uniform shape regardless of provider
 *
 * For now this is a non-streaming generateText wrapper. Streaming will
 * be layered on once the basic path is working.
 */

import { generateText, type ModelMessage } from 'ai'

import {
  isAssistantEnabled,
  selectNextModel,
  reportRateLimit,
  type ProviderName,
} from './provider'

export interface GenerateResult {
  text: string
  provider: ProviderName | null      // null = canned/fallback response
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  fallback: boolean                  // true if no provider was reachable
}

const MAX_FALLBACK_ATTEMPTS = 4  // generous — covers full provider rotation

export async function generate(messages: ModelMessage[]): Promise<GenerateResult> {
  if (!isAssistantEnabled()) {
    return canned("Forgie is currently disabled. Set ASSISTANT_ENABLED=true and add API keys to enable.")
  }

  const t0 = Date.now()
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_FALLBACK_ATTEMPTS; attempt++) {
    const selection = selectNextModel()
    if (!selection) {
      // Every provider exhausted — return canned response
      return canned(
        "I'm getting a lot of traffic right now. Give me a moment and try again — should be back to normal shortly.",
        Date.now() - t0,
      )
    }

    try {
      const result = await generateText({
        model: selection.model,
        messages,
        // Slightly above default — keeps responses varied across identical
        // queries without going off the rails. Forgie should sound a little
        // different each time, not robotic.
        temperature: 0.85,
      })

      return {
        text: result.text,
        provider: selection.provider,
        model: selection.modelName,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        latencyMs: Date.now() - t0,
        fallback: false,
      }
    } catch (err) {
      lastError = err
      const isRateLimit = looksLikeRateLimit(err)
      const errSummary = errToSummary(err)
      if (isRateLimit) {
        console.warn(`[llm] ${selection.provider} rate-limited (key ending ...${selection.apiKey.slice(-6)}), trying next: ${errSummary}`)
        reportRateLimit(selection.provider, selection.apiKey)
        continue
      }
      console.warn(`[llm] ${selection.provider} errored (key ending ...${selection.apiKey.slice(-6)}), trying next: ${errSummary}`)
      reportRateLimit(selection.provider, selection.apiKey)
      continue
    }
  }

  console.error('[llm] all providers exhausted, last error:', lastError)
  return canned(
    "Hit a snag with all my upstream providers. Try again in a minute — if it keeps happening, ping an admin.",
    Date.now() - t0,
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function canned(text: string, latencyMs = 0): GenerateResult {
  return {
    text,
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    latencyMs,
    fallback: true,
  }
}

function errToSummary(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err)
  const e = err as { statusCode?: number; status?: number; message?: string; name?: string }
  const code = e.statusCode ?? e.status ?? '?'
  const msg = e.message?.split('\n')[0]?.slice(0, 200) ?? e.name ?? 'unknown'
  return `[${code}] ${msg}`
}

function looksLikeRateLimit(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { statusCode?: number; status?: number; message?: string }
  if (e.statusCode === 429 || e.status === 429) return true
  if (typeof e.message === 'string' && /rate.?limit|too many requests|quota/i.test(e.message)) {
    return true
  }
  return false
}
