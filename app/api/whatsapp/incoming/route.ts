/**
 * POST /api/whatsapp/incoming
 *
 * Webhook the WhatsApp bridge calls when a message arrives at Forgie's
 * WhatsApp account. The bridge POSTs:
 *   {
 *     from:      string  // sender JID (xxx@c.us for DM, participant JID for group)
 *     chatJid:   string  // chat JID (same as from for DM, group JID for group)
 *     body:      string  // text content
 *     isGroup:   boolean
 *     pushName:  string  // sender's display name on WA
 *     timestamp: number  // unix seconds
 *   }
 * Auth: shared secret in the `x-wa-secret` header (env RIGFORGE_WA_SECRET).
 *
 * P11.4: this used to be a stub that logged + acked. It now hands the
 * payload off to lib/assistant/whatsapp-handler — which resolves the
 * sender to a User, runs the Forgie LLM pipeline, and replies via the
 * bridge with an "AI-generated" disclaimer footer appended.
 */

import { type NextRequest } from 'next/server'

import { errorResponse, successResponse } from '@/lib/api-helpers'
import { handleIncomingWhatsapp } from '@/lib/assistant/whatsapp-handler'

export async function POST(request: NextRequest) {
  const expected = process.env.RIGFORGE_WA_SECRET
  if (!expected) {
    console.error('[POST /api/whatsapp/incoming] RIGFORGE_WA_SECRET not set')
    return errorResponse('Server not configured for WhatsApp', 503)
  }

  const got = request.headers.get('x-wa-secret')
  if (!got || got !== expected) {
    return errorResponse('Unauthorized', 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Request body must be valid JSON', 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('Request body must be a JSON object', 400)
  }

  const { from, chatJid, body: text, isGroup, pushName, timestamp } =
    body as Record<string, unknown>

  if (typeof from !== 'string' || typeof text !== 'string') {
    return errorResponse('from and body are required strings', 400)
  }

  try {
    const result = await handleIncomingWhatsapp({
      from,
      chatJid: typeof chatJid === 'string' ? chatJid : from,
      body: text,
      isGroup: Boolean(isGroup),
      pushName: typeof pushName === 'string' ? pushName : '',
      timestamp: typeof timestamp === 'number' ? timestamp : 0,
    })
    return successResponse(result)
  } catch (err) {
    console.error('[POST /api/whatsapp/incoming] handler crash:', err)
    // Don't 500 — the bridge will retry. Ack so the message isn't redelivered
    // forever; the user just doesn't get a reply this round.
    return successResponse({ processed: false, reason: 'handler-error' })
  }
}
