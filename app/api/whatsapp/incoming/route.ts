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
 *     pushName:  string  // sender's display name
 *     timestamp: number  // unix seconds
 *   }
 * Auth: shared secret in the `x-wa-secret` header (env RIGFORGE_WA_SECRET).
 *
 * Current behaviour (P11.3 stub): verify + log + ack. Real conversation
 * routing into Forgie's LLM is P11.4 — that's a UX decision (do incoming
 * DMs auto-reply over WA? do they create an AssistantConversation?
 * who can DM "Forgie" — only users whose whatsappNumber is on file?).
 */

import { type NextRequest } from 'next/server'

import { errorResponse, successResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest) {
  const expected = process.env.RIGFORGE_WA_SECRET
  if (!expected) {
    // Misconfigured server — fail loudly so the bridge sees it
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

  const {
    from,
    chatJid,
    body: text,
    isGroup,
    pushName,
    timestamp,
  } = body as Record<string, unknown>

  if (typeof from !== 'string' || typeof text !== 'string') {
    return errorResponse('from and body are required strings', 400)
  }

  // Stub: log it. P11.4 will resolve `from` → User via whatsappNumber and
  // either drop a message into the user's AssistantConversation or trigger
  // a Forgie auto-reply over WhatsApp.
  console.log('[whatsapp/incoming]', {
    from,
    chatJid,
    isGroup: Boolean(isGroup),
    pushName: typeof pushName === 'string' ? pushName : null,
    timestamp: typeof timestamp === 'number' ? timestamp : null,
    bodyPreview: text.length > 120 ? text.slice(0, 120) + '…' : text,
  })

  return successResponse({ received: true })
}
