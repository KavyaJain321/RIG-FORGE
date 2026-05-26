/**
 * Cron-endpoint auth helper.
 *
 * Render's free tier doesn't run scheduled jobs internally, so the P4
 * features (daily-log drafts, standup digest, project-health watchdog)
 * are exposed as HTTP endpoints under /api/cron/* and called by an
 * external scheduler (cron-job.org, GitHub Actions, EasyCron, etc.).
 *
 * Every cron-driven endpoint MUST gate on isCronAuthorized() to keep
 * randos from triggering team-wide AI work.
 */

import { type NextRequest } from 'next/server'

export function isCronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected || expected.length < 8) return false

  // Accept the secret via header (preferred) or query (fallback for
  // schedulers that don't support custom headers).
  const headerSecret = request.headers.get('x-cron-secret')
  if (headerSecret && timingSafeEqual(headerSecret, expected)) return true

  const querySecret = request.nextUrl.searchParams.get('secret')
  if (querySecret && timingSafeEqual(querySecret, expected)) return true

  return false
}

// Constant-time compare so attackers can't time-attack the secret.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
