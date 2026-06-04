/**
 * Multi-provider LLM with key pools + cross-provider fallback.
 *
 * The picture:
 *   - Each provider (groq, gemini, cerebras) has a POOL of API keys.
 *   - Within a provider, keys are rotated round-robin.
 *   - When a key returns 429 (rate-limited), it's marked cooling-down
 *     for COOLDOWN_MS. Other keys in the pool keep serving.
 *   - When ALL keys in a provider are cooling down OR an unrelated error
 *     blocks the provider, requests fall through to the NEXT provider in
 *     ASSISTANT_PROVIDER_ORDER.
 *   - If every provider fails, the caller gets a canned response.
 *
 * Add more keys later by appending to GROQ_API_KEYS / GEMINI_API_KEYS /
 * CEREBRAS_API_KEYS in .env (comma-separated). No code change needed.
 */

import { createGroq } from '@ai-sdk/groq'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

export type ProviderName = 'groq' | 'gemini' | 'cerebras'

const COOLDOWN_MS = 60_000  // mark a key cool for 60s after a 429

interface KeyState {
  key: string
  cooldownUntil: number  // epoch ms; 0 = available
}

interface ProviderPool {
  name: ProviderName
  keys: KeyState[]
  cursor: number  // round-robin pointer
  model: string
  buildModel: (apiKey: string, modelName: string) => LanguageModel
}

// ─── Env parsing ─────────────────────────────────────────────────────────────

function parseKeyList(envValue: string | undefined): string[] {
  if (!envValue) return []
  return envValue
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

// ─── Pool initialization ─────────────────────────────────────────────────────

let pools: Map<ProviderName, ProviderPool> | null = null

function initPools(): Map<ProviderName, ProviderPool> {
  const map = new Map<ProviderName, ProviderPool>()

  const groqKeys = parseKeyList(process.env.GROQ_API_KEYS)
  if (groqKeys.length > 0) {
    map.set('groq', {
      name: 'groq',
      keys: groqKeys.map((key) => ({ key, cooldownUntil: 0 })),
      cursor: 0,
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      buildModel: (apiKey, modelName) => createGroq({ apiKey })(modelName),
    })
  }

  const geminiKeys = parseKeyList(process.env.GEMINI_API_KEYS)
  if (geminiKeys.length > 0) {
    map.set('gemini', {
      name: 'gemini',
      keys: geminiKeys.map((key) => ({ key, cooldownUntil: 0 })),
      cursor: 0,
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
      buildModel: (apiKey, modelName) => createGoogleGenerativeAI({ apiKey })(modelName),
    })
  }

  const cerebrasKeys = parseKeyList(process.env.CEREBRAS_API_KEYS)
  if (cerebrasKeys.length > 0) {
    map.set('cerebras', {
      name: 'cerebras',
      keys: cerebrasKeys.map((key) => ({ key, cooldownUntil: 0 })),
      cursor: 0,
      model: process.env.CEREBRAS_MODEL ?? 'llama-3.3-70b',
      buildModel: (apiKey, modelName) =>
        createOpenAICompatible({
          name: 'cerebras',
          apiKey,
          baseURL: 'https://api.cerebras.ai/v1',
        })(modelName),
    })
  }

  return map
}

function getPools(): Map<ProviderName, ProviderPool> {
  if (!pools) pools = initPools()
  return pools
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export function isAssistantEnabled(): boolean {
  if (process.env.ASSISTANT_ENABLED !== 'true') return false
  return getPools().size > 0
}

export function getProviderOrder(): ProviderName[] {
  const raw = process.env.ASSISTANT_PROVIDER_ORDER ?? 'groq,gemini,cerebras'
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderName => s === 'groq' || s === 'gemini' || s === 'cerebras')
}

// Pick the next available key in a pool. Returns null if all are cooling down.
function pickKey(pool: ProviderPool): KeyState | null {
  const now = Date.now()
  for (let i = 0; i < pool.keys.length; i++) {
    const idx = (pool.cursor + i) % pool.keys.length
    const k = pool.keys[idx]
    if (k && k.cooldownUntil <= now) {
      pool.cursor = (idx + 1) % pool.keys.length  // advance for next caller
      return k
    }
  }
  return null
}

function markKeyRateLimited(pool: ProviderPool, key: string): void {
  const k = pool.keys.find((x) => x.key === key)
  if (k) k.cooldownUntil = Date.now() + COOLDOWN_MS
}

// ─── Pick a model for the next request ───────────────────────────────────────
// Returns the constructed LanguageModel + metadata about who served it.
// Caller is responsible for catching errors and calling onError() so we
// can mark keys as rate-limited.

export interface SelectedModel {
  model: LanguageModel
  provider: ProviderName
  modelName: string
  apiKey: string
}

export function selectNextModel(): SelectedModel | null {
  const order = getProviderOrder()
  const map = getPools()

  for (const providerName of order) {
    const pool = map.get(providerName)
    if (!pool) continue
    const key = pickKey(pool)
    if (!key) continue  // all keys in this provider are cooling down — try next
    return {
      model: pool.buildModel(key.key, pool.model),
      provider: pool.name,
      modelName: pool.model,
      apiKey: key.key,
    }
  }
  return null  // nothing available right now
}

// ─── Error reporting from caller ─────────────────────────────────────────────
// The route layer should call this when a model invocation 429s.

export function reportRateLimit(provider: ProviderName, apiKey: string): void {
  const pool = getPools().get(provider)
  if (pool) markKeyRateLimited(pool, apiKey)
}

// ─── Diagnostics (for admin debug UI later) ──────────────────────────────────

export function getPoolStatus() {
  const map = getPools()
  const now = Date.now()
  return Array.from(map.values()).map((pool) => ({
    provider: pool.name,
    model: pool.model,
    keyCount: pool.keys.length,
    availableKeys: pool.keys.filter((k) => k.cooldownUntil <= now).length,
    coolingDownKeys: pool.keys.filter((k) => k.cooldownUntil > now).length,
  }))
}
