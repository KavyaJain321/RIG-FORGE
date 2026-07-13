/**
 * Signed, time-limited share tokens for NAS files. A token is a JWT over
 * { server, path } — anyone holding it can download that one file until it
 * expires, WITHOUT a RIG-FORGE session. Used for "copy share link" so a file
 * can be sent over WhatsApp/email/etc. Read-only, single-file, expiring.
 */
import jwt from 'jsonwebtoken'

const PURPOSE = 'nas-share'
const DEFAULT_TTL_SECONDS = 7 * 24 * 3600 // 7 days

export function signShareToken(server: string, path: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ server, path, purpose: PURPOSE }, secret, { expiresIn: ttlSeconds })
}

export function verifyShareToken(token: string): { server: string; path: string } | null {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  try {
    const d = jwt.verify(token, secret) as Record<string, unknown>
    if (d.purpose !== PURPOSE || typeof d.server !== 'string' || typeof d.path !== 'string') return null
    return { server: d.server, path: d.path }
  } catch {
    return null
  }
}
