/**
 * Forgie tools — WhatsApp bridge.
 *
 * Thin wrapper over lib/whatsapp/bridge.ts that exposes admin-only read +
 * write capabilities to the assistant. Mirrors the gmail/gcal pattern:
 *   - Read functions are called from ai-sdk-tools.ts execute()
 *   - Write functions are called from app/api/assistant/actions/execute/route.ts
 *     AFTER the user confirms a proposal card.
 *
 * Reachability: requires WA_BRIDGE_URL + WA_BRIDGE_SECRET env vars on the
 * main app, AND the bridge service to be deployed + connected to WhatsApp.
 * The tools self-gate via isWhatsappEnabled() so the assistant never sees
 * them when the bridge isn't configured.
 */

import {
  isWhatsAppEnabled,
  getBridgeStatus,
  sendWhatsappMessage,
  createWhatsappGroup,
  listWhatsappGroups,
} from '@/lib/whatsapp/bridge'

export { isWhatsAppEnabled }

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getStatus() {
  // Don't surface bridge HTTP errors to the LLM — translate to a structured
  // "not reachable" so Forgie can tell the user something useful.
  try {
    return await getBridgeStatus()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return {
      ready: false,
      scanning: false,
      startingUp: false,
      hasQR: false,
      phone: null,
      error: `Bridge unreachable: ${message}`,
    }
  }
}

export async function listGroups() {
  try {
    return await listWhatsappGroups()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return { groups: [], error: message }
  }
}

// ─── Write (called from actions/execute after Confirm) ───────────────────────

export interface SendMessageArgs {
  to: string         // E.164 digits or full JID; lib/whatsapp/bridge normalises
  message: string
}

export async function sendMessage(args: SendMessageArgs) {
  return sendWhatsappMessage(args)
}

export interface CreateGroupArgs {
  name: string
  participants: string[]   // E.164 digits or JIDs
}

export async function createGroup(args: CreateGroupArgs) {
  return createWhatsappGroup(args)
}
