/**
 * Application-level field encryption for at-rest secrets (e.g. the admin-
 * retrievable temp password). AES-256-GCM with a random IV per value and an
 * authentication tag, so stored values are confidential and tamper-evident.
 *
 * Key: `FIELD_ENCRYPTION_KEY` env var (any non-empty string — we derive a
 * 32-byte key from it via SHA-256, so a passphrase or base64 key both work).
 *
 * Graceful degradation:
 *   - No key configured → `encryptSecret` returns null (we store nothing
 *     recoverable; the "view later" feature is simply unavailable until a key
 *     is set). This keeps us secure-by-default rather than falling back to
 *     plaintext.
 *   - `decryptSecret` of a value that isn't in our `v1:` format is treated as
 *     a legacy plaintext row and returned as-is, so existing temp passwords
 *     keep displaying until the user next changes their password (which clears
 *     the field). New writes are always encrypted.
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const PREFIX = 'v1:'

function getKey(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY
  if (!raw) return null
  // Derive a fixed 32-byte key from whatever the operator provided.
  return createHash('sha256').update(raw).digest()
}

/** Encrypt a secret for storage. Returns null if no key is configured. */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null
  const key = getKey()
  if (!key) return null

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** Decrypt a stored secret. Legacy (non-prefixed) values are returned as-is. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.startsWith(PREFIX)) return stored // legacy plaintext row
  const key = getKey()
  if (!key) return null

  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':')
    if (!ivB64 || !tagB64 || !ctB64) return null
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()])
    return pt.toString('utf8')
  } catch {
    return null
  }
}
