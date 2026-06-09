/**
 * Constant-time string comparison for shared secrets (webhook/bridge tokens).
 * A plain `a === b` short-circuits on the first differing byte, which leaks
 * how much of the secret was guessed via response timing. timingSafeEqual
 * compares in time independent of where the mismatch is.
 */

import { timingSafeEqual } from 'crypto'

export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // Length is not itself secret here, and timingSafeEqual requires equal-length
  // buffers, so a length mismatch is a fast (and safe) reject.
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
