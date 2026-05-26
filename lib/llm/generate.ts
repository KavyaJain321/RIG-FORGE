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

import { generateText, stepCountIs, type ModelMessage, type ToolSet } from 'ai'

import {
  isAssistantEnabled,
  selectNextModel,
  reportRateLimit,
  type ProviderName,
} from './provider'

export interface ToolCallRecord {
  name: string
  args: unknown
  result: unknown
  errored: boolean
}

export interface GenerateResult {
  text: string
  provider: ProviderName | null      // null = canned/fallback response
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  fallback: boolean                  // true if no provider was reachable
  toolCalls: ToolCallRecord[]        // empty if the model didn't reach for tools
}

// Cap on how many provider/key attempts we make in one request. Should be
// >= the total number of API keys across all providers so the full pool
// gets a chance before we surrender. Bumping it costs nothing — the loop
// exits early as soon as selectNextModel() returns null.
const MAX_FALLBACK_ATTEMPTS = 10
const MAX_TOOL_STEPS = 3         // up to 3 tool calls per LLM turn

export interface GenerateOptions {
  /** Optional tools the LLM may call mid-generation. */
  tools?: ToolSet
}

export async function generate(
  messages: ModelMessage[],
  options: GenerateOptions = {},
): Promise<GenerateResult> {
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
      // Per-attempt: if tool calling fails (provider rejects the schema),
      // we retry the SAME key without tools so the user still gets an
      // answer from context. Tool-call errors aren't the user's fault.
      let result
      try {
        result = await generateText({
          model: selection.model,
          messages,
          temperature: 0.85,
          ...(options.tools && {
            tools: options.tools,
            stopWhen: stepCountIs(MAX_TOOL_STEPS),
          }),
        })
      } catch (toolErr) {
        const usedTools = !!options.tools
        const isToolErr = usedTools && looksLikeToolCallError(toolErr)
        if (!isToolErr) throw toolErr
        console.warn(
          `[llm] ${selection.provider} rejected tool schema, retrying without tools: ${errToSummary(toolErr)}`,
        )
        result = await generateText({
          model: selection.model,
          messages,
          temperature: 0.85,
        })
      }

      // Flatten tool calls/results across steps into a single audit-friendly list
      const toolCalls: ToolCallRecord[] = []
      for (const step of result.steps ?? []) {
        const calls = step.content.filter((c) => c.type === 'tool-call')
        const results = step.content.filter(
          (c) => c.type === 'tool-result' || c.type === 'tool-error',
        )
        for (const call of calls) {
          const match = results.find(
            (r) => 'toolCallId' in r && r.toolCallId === call.toolCallId,
          )
          toolCalls.push({
            name: call.toolName,
            args: call.input,
            result:
              match && 'output' in match
                ? match.output
                : match && 'error' in match
                  ? String(match.error)
                  : null,
            errored: match?.type === 'tool-error',
          })
        }
      }

      return {
        text: result.text,
        provider: selection.provider,
        model: selection.modelName,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        latencyMs: Date.now() - t0,
        fallback: false,
        toolCalls,
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
    toolCalls: [],
  }
}

function errToSummary(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err)
  const e = err as { statusCode?: number; status?: number; message?: string; name?: string }
  const code = e.statusCode ?? e.status ?? '?'
  const msg = e.message?.split('\n')[0]?.slice(0, 200) ?? e.name ?? 'unknown'
  return `[${code}] ${msg}`
}

function looksLikeToolCallError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { statusCode?: number; status?: number; message?: string }
  const code = e.statusCode ?? e.status
  // Tool-related errors are typically 400 (bad request) with messages
  // mentioning function/tool call problems. We're conservative — only
  // match clear tool-call failures to avoid masking real bugs.
  if (code !== 400) return false
  if (typeof e.message !== 'string') return false
  return /tool|function|failed_generation|adjust your prompt/i.test(e.message)
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
