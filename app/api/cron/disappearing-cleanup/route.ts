/**
 * POST /api/cron/disappearing-cleanup
 *
 * Cron-driven. Hard-deletes chat messages older than each conversation's
 * disappearing-messages TTL. Until now disappearing only HID messages on read
 * (listMessages cutoff); this removes them from the server for real.
 *
 * Idempotent — re-running just deletes whatever is now past the TTL.
 */
import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { isCronAuthorized } from '@/lib/cron'
import { deleteObject, keyFromProxyPath } from '@/lib/storage/r2'

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return errorResponse('Unauthorized', 401)
  try {
    const convos = await prisma.conversation.findMany({
      where: { disappearingSeconds: { not: null } },
      select: { id: true, disappearingSeconds: true },
    })
    let deleted = 0
    for (const c of convos) {
      if (!c.disappearingSeconds) continue
      const cutoff = new Date(Date.now() - c.disappearingSeconds * 1000)
      // Collect media keys first so we can free their R2 objects after the rows go.
      const expiring = await prisma.chatMessage.findMany({
        where: { conversationId: c.id, createdAt: { lt: cutoff }, type: { in: ['IMAGE', 'FILE', 'AUDIO'] } },
        select: { content: true },
      })
      // Cascades to reactions/stars; reply links SetNull.
      const r = await prisma.chatMessage.deleteMany({
        where: { conversationId: c.id, createdAt: { lt: cutoff } },
      })
      deleted += r.count
      for (const m of expiring) {
        const key = keyFromProxyPath(m.content)
        if (key) void deleteObject(key)
      }
    }
    return successResponse({ conversationsScanned: convos.length, messagesDeleted: deleted })
  } catch (error) {
    console.error('[cron/disappearing-cleanup]', error)
    return errorResponse('Cleanup failed', 500)
  }
}
