/**
 * Shared WhatsApp number helpers.
 *
 * normalizeWhatsappNumber: loose input → canonical E.164 ("+919876543210").
 * This is the single source of truth for how a number is stored, used by the
 * profile PATCH and the OTP-verification flow so both agree on the canonical
 * form (which is what inbound resolution in whatsapp-handler matches against).
 */

// Accepts loose input (spaces / dashes / parens, optional + prefix, or a bare
// 10-digit Indian number) and returns canonical E.164. Throws on garbage.
// Empty string → null.
export function normalizeWhatsappNumber(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')

  if (!digits) {
    throw new Error('WhatsApp number must contain digits')
  }

  // Bare 10 digits → assume India (matches the bridge's normaliseRecipient).
  if (!hasPlus && digits.length === 10) return `+91${digits}`

  // 12 digits starting with 91 → India, just add the +.
  if (!hasPlus && digits.length === 12 && digits.startsWith('91')) return `+${digits}`

  // E.164 allows 7–15 digits after the +.
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`

  throw new Error('Use E.164 format (e.g. +919876543210) or a 10-digit Indian number')
}

// Mask for display/logging: "+919876543210" → "+9198••••3210".
export function maskWhatsappNumber(e164: string): string {
  if (e164.length <= 7) return e164
  const head = e164.slice(0, 5)
  const tail = e164.slice(-4)
  return `${head}••••${tail}`
}
