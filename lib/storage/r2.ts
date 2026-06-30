/**
 * Chat media storage — Cloudflare R2 fronted by our `rf-media` Worker.
 *
 * The team's ISPs SNI-block R2's S3 endpoint (*.r2.cloudflarestorage.com), so we
 * never talk S3. Instead the Worker (worker/src/index.js) is served on our own
 * domain (R2_PUBLIC_HOST) and bound to the bucket. We mint short-lived HMAC tokens
 * here; the Worker verifies them. Tokens bind method + key + expiry, so a read
 * token can't write and a token for one key can't touch another.
 *
 * Objects are PRIVATE — reads go through the authenticated media proxy
 * (app/api/chat/media/[...path]) which 302-redirects to a signed GET URL.
 * Uploads are direct browser PUTs to a signed URL (so 100 MB files never pass
 * through the Next server). Server-only — never import into a client component.
 */
import { createHmac } from 'node:crypto'

const host = process.env.R2_PUBLIC_HOST // e.g. media.rig360media.com
const secret = process.env.R2_SIGNING_SECRET

export function r2Configured(): boolean {
  return Boolean(host && secret)
}

function sign(method: 'GET' | 'PUT' | 'DELETE', key: string, expMs: number): string {
  return createHmac('sha256', secret as string).update(`${method}:${key}:${expMs}`).digest('hex')
}

function signedUrl(method: 'GET' | 'PUT' | 'DELETE', key: string, ttlSeconds: number): string | null {
  if (!host || !secret) return null
  const exp = Date.now() + ttlSeconds * 1000
  const sig = sign(method, key, exp)
  // Keys are [a-z0-9/_.-] so the path needs no escaping; query carries the token.
  return `https://${host}/${key}?exp=${exp}&sig=${sig}`
}

// Short-lived read URL the media proxy redirects to. 24h so the browser can cache
// the image for the life of the URL.
export function signedDownloadUrl(key: string, ttlSeconds = 86400): string | null {
  return signedUrl('GET', key, ttlSeconds)
}

// Short-lived write URL the browser PUTs the file to directly.
export function signedUploadUrl(key: string, ttlSeconds = 300): string | null {
  return signedUrl('PUT', key, ttlSeconds)
}

// Server-side helpers — upload a small asset (group photo) or delete media.
// Both go through the Worker so they work even where the S3 endpoint is blocked.
export async function putObject(key: string, body: Buffer, contentType: string): Promise<boolean> {
  const url = signedUploadUrl(key, 120)
  if (!url) return false
  const res = await fetch(url, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': contentType },
  })
  return res.ok
}

export async function deleteObject(key: string): Promise<void> {
  const url = signedUrl('DELETE', key, 120)
  if (!url) return
  try {
    await fetch(url, { method: 'DELETE' })
  } catch (err) {
    console.error('[r2] delete failed', key, err)
  }
}

// Messages store a stable proxy path "/api/chat/media/<key>"; turn it back into
// the bare R2 object key (or null if it isn't an R2-backed media path).
export function keyFromProxyPath(content: string): string | null {
  const prefix = '/api/chat/media/'
  if (!content.startsWith(prefix)) return null
  const key = content.slice(prefix.length).split('?')[0]
  return key || null
}
