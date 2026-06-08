/**
 * Client for the Forgie WhatsApp bridge service (whatsapp-bridge/).
 *
 * The bridge runs as a separate Render service. It owns the Baileys
 * connection; we just talk to it over HTTP with a shared secret.
 *
 * Env vars (set in RIG FORGE's Render env):
 *   WA_BRIDGE_URL    — https://forgie-whatsapp-bridge.onrender.com
 *   WA_BRIDGE_SECRET — same value as BRIDGE_SECRET on the bridge
 */

const URL    = process.env.WA_BRIDGE_URL ?? ''
const SECRET = process.env.WA_BRIDGE_SECRET ?? ''

export function isWhatsAppEnabled(): boolean {
  return Boolean(URL && SECRET)
}

async function bridge(method: 'GET' | 'POST', path: string, body?: object) {
  if (!isWhatsAppEnabled()) {
    throw new Error('WhatsApp bridge not configured (WA_BRIDGE_URL / WA_BRIDGE_SECRET missing)')
  }
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-secret': SECRET,
    },
    ...(body && { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = { error: text } }
  if (!res.ok) {
    const err = (json as { error?: string })?.error ?? `HTTP ${res.status}`
    throw new Error(err)
  }
  return json as Record<string, unknown>
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getBridgeStatus() {
  return bridge('GET', '/status') as Promise<{
    ready: boolean
    scanning: boolean
    startingUp: boolean
    hasQR: boolean
    phone: string | null
  }>
}

// Normalise a phone number to E.164 (digits only). +91 XXXXX → 91XXXXX.
// Also accepts JIDs (xxx@c.us or xxx@g.us) — passes them through.
export function normaliseRecipient(input: string): string {
  if (input.includes('@')) return input  // already a JID
  const digits = input.replace(/\D/g, '')
  if (!digits) throw new Error('Invalid phone number')
  // Default to India country code if 10 digits without country code
  return digits.length === 10 ? `91${digits}` : digits
}

export async function sendWhatsappMessage(args: { to: string; message: string }) {
  return bridge('POST', '/send', {
    to: normaliseRecipient(args.to),
    message: args.message,
  }) as Promise<{ ok: boolean; to: string }>
}

export async function createWhatsappGroup(args: { name: string; participants: string[] }) {
  return bridge('POST', '/create-group', {
    name: args.name,
    participants: args.participants.map(normaliseRecipient),
  }) as Promise<{ ok: boolean; groupId: string; name: string }>
}

export async function listWhatsappGroups() {
  return bridge('GET', '/groups') as Promise<{
    groups: Array<{ id: string; name: string; participants: number }>
  }>
}

export async function removeWhatsappParticipants(args: {
  groupJid: string
  participants: string[]
}) {
  return bridge('POST', '/remove-participants', {
    groupJid: args.groupJid,
    participants: args.participants.map(normaliseRecipient),
  }) as Promise<{
    ok: boolean
    groupJid: string
    removed: string[]
    failed: Array<{ jid: string; status: string }>
  }>
}

// Forgie has no real "delete group" — leaving is the closest WhatsApp
// equivalent (the group continues to exist for remaining members).
export async function leaveWhatsappGroup(args: { groupJid: string }) {
  return bridge('POST', '/leave-group', {
    groupJid: args.groupJid,
  }) as Promise<{ ok: boolean; groupJid: string; left: boolean }>
}
