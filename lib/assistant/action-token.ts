/**
 * Action-proposal binding tokens.
 *
 * When Forgie proposes a write action, the message route signs an HMAC token
 * over (userId, action, args, expiry) and ships it to the client inside the
 * proposal card. When the user taps Confirm, the execute route re-signs the
 * SAME binding from the request and constant-time-compares it to the token.
 *
 * This is what makes the confirm step a real server-side gate rather than a
 * UI affordance. It guarantees:
 *   - The args executed are byte-for-byte what Forgie proposed (no tampering
 *     with projectId / assigneeId / recipient / etc. between propose and run).
 *   - Only the user the proposal was issued to can execute it (bound to userId).
 *   - No write action can be executed without a matching server-issued token
 *     (you can't forge `{action, args}` and hit /execute directly).
 *
 * Tokens are stateless (no DB row) and expire after TTL_MS, so a leaked token
 * is only replayable by the same user, for the same exact action, briefly.
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** How long a proposal stays confirmable. */
const TTL_MS = 15 * 60 * 1000 // 15 minutes

function getSecret(): string {
  // Prefer a dedicated secret; fall back to the JWT secret so this works
  // without extra env configuration.
  const s = process.env.ASSISTANT_ACTION_SECRET || process.env.JWT_SECRET
  if (!s) {
    throw new Error('ASSISTANT_ACTION_SECRET or JWT_SECRET must be set to sign action proposals')
  }
  return s
}

/**
 * Deterministic stringify with recursively sorted object keys, so that the
 * client re-serializing the args (in any key order) still produces the exact
 * signing input the server used. Arrays keep their order; primitives use
 * standard JSON encoding.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

function computeSig(exp: number, binding: ActionBinding): string {
  const payload = `${exp}.${binding.userId}.${binding.action}.${stableStringify(binding.args)}`
  return createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export interface ActionBinding {
  userId: string
  action: string
  args: Record<string, unknown>
}

/** Sign a proposal. Returns an opaque `"<exp>.<hexSig>"` token. */
export function signActionToken(binding: ActionBinding): string {
  const exp = Date.now() + TTL_MS
  return `${exp}.${computeSig(exp, binding)}`
}

/**
 * Verify a token against the binding reconstructed from the execute request.
 * Returns ok:false with a reason on any mismatch — never throws on bad input.
 */
export function verifyActionToken(
  token: string,
  binding: ActionBinding,
): { ok: true } | { ok: false; reason: 'malformed' | 'expired' | 'bad-signature' } {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' }
  const dot = token.indexOf('.')
  if (dot <= 0) return { ok: false, reason: 'malformed' }

  const exp = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!Number.isFinite(exp) || sig.length === 0) return { ok: false, reason: 'malformed' }
  if (Date.now() > exp) return { ok: false, reason: 'expired' }

  const expected = computeSig(exp, binding)
  let a: Buffer
  let b: Buffer
  try {
    a = Buffer.from(sig, 'hex')
    b = Buffer.from(expected, 'hex')
  } catch {
    return { ok: false, reason: 'bad-signature' }
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' }
  }
  return { ok: true }
}
