/**
 * Response cache for Forgie.
 *
 * Many user queries are repetitive across a team — "what's due this week",
 * "who's on Childsafe", "show me overdue tickets". Caching the response
 * for ~5 minutes cuts traffic by 30-60% in practice.
 *
 * Cache key is the SHA-256 of (userId, normalized query, role). Per-user
 * because permissions affect what data is loaded into the context — an
 * employee and admin asking the same question see different answers.
 */

import { createHash } from 'crypto'
import { prisma } from '@/lib/db'

const TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface CachedResponse {
  response: string
  hits: number
}

function buildCacheKey(args: {
  userId: string
  role: string
  query: string
}): string {
  const normalized = args.query.trim().toLowerCase().replace(/\s+/g, ' ')
  const hash = createHash('sha256')
  hash.update(args.userId)
  hash.update('|')
  hash.update(args.role)
  hash.update('|')
  hash.update(normalized)
  return hash.digest('hex')
}

export async function lookupCache(args: {
  userId: string
  role: string
  query: string
}): Promise<CachedResponse | null> {
  const cacheKey = buildCacheKey(args)
  const now = new Date()

  const row = await prisma.assistantResponseCache.findUnique({
    where: { cacheKey },
    select: { response: true, hits: true, expiresAt: true },
  })

  if (!row) return null
  if (row.expiresAt < now) {
    // Expired — clean it up asynchronously, return miss
    void prisma.assistantResponseCache.delete({ where: { cacheKey } }).catch(() => {})
    return null
  }

  // Bump the hit counter (best-effort, non-blocking)
  void prisma.assistantResponseCache
    .update({ where: { cacheKey }, data: { hits: { increment: 1 } } })
    .catch(() => {})

  return { response: row.response, hits: row.hits }
}

export async function storeCache(args: {
  userId: string
  role: string
  query: string
  response: string
}): Promise<void> {
  const cacheKey = buildCacheKey(args)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TTL_MS)

  await prisma.assistantResponseCache.upsert({
    where: { cacheKey },
    create: { cacheKey, response: args.response, expiresAt, hits: 0 },
    update: { response: args.response, expiresAt, hits: 0 },
  })
}

// ─── Sweeper — clean expired entries occasionally ────────────────────────────
// Best run as a periodic background job or cron. For v0 we run it
// opportunistically (1% of requests trigger a cleanup).

export async function maybeSweepCache(): Promise<void> {
  if (Math.random() > 0.01) return
  const now = new Date()
  await prisma.assistantResponseCache
    .deleteMany({ where: { expiresAt: { lt: now } } })
    .catch(() => { /* sweep failures are not fatal */ })
}
