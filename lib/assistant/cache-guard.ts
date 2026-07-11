/**
 * Cacheability rule for Forgie responses — kept in its own module (no prisma /
 * DB imports) so it is pure and trivially testable, and so both the API route
 * gate and cache.storeCache can share exactly one definition.
 */

// Every canned fallback/error string Forgie can emit (see pickFallbackMessage +
// the empty-reply nudge in app/api/assistant/message/route.ts). These are NOT
// genuine model answers and must never be written to the response cache —
// otherwise a transient provider outage gets "pinned" and replayed for the TTL.
//
// Keep in sync with route.ts. Matched by exact (trimmed) equality, so localized
// or rebranded variants of these strings must be added here too.
export const CANNED_MESSAGES: ReadonlySet<string> = new Set([
  "Sorry — I didn't manage to put together a reply for that one. Mind rephrasing, or giving me a little more detail?",
  "I'm getting a lot of traffic right now. Give me a moment and try again — should be back to normal shortly.",
  'Forgie is currently disabled. Ask an admin to enable it.',
  'Hit a snag with all my upstream providers. Try again in a minute.',
])

/**
 * Whether a response is a genuine, non-trivial model answer worth caching.
 * Rejects canned fallbacks and empty/very-short replies (almost always
 * degenerate output). Single source of truth for cacheability.
 */
export function isCacheableResponse(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 8) return false
  if (CANNED_MESSAGES.has(trimmed)) return false
  return true
}
