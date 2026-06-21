/**
 * Web Push sender. Wraps the `web-push` library + VAPID config. No-ops cleanly
 * when VAPID keys aren't configured (e.g. local dev without keys), so callers
 * can fire-and-forget without guarding.
 */
import webpush from 'web-push'

import { prisma } from '@/lib/db'

let configured: boolean | null = null

function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@rigforge.com'
  if (!pub || !priv) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!ensureConfigured() || userIds.length === 0) return
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } })
  if (subs.length === 0) return
  const body = JSON.stringify(payload)
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode
        // 404/410 → the subscription is gone; prune it so we stop trying.
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
        }
      }
    }),
  )
}
