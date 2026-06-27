import { type NextRequest } from 'next/server'
import type { ModelMessage } from 'ai'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { getMessage, isUserGmailEnabled } from '@/lib/assistant/tools/gmail'
import { isGoogleReauthError } from '@/lib/google/oauth'
import { generate } from '@/lib/llm/generate'

// POST /api/google/gmail/assist — { messageId, mode: 'summarize' | 'reply', instruction? }
// Forgie tie-in for the Mail panel: summarize a thread or draft a reply.
export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  const payload = verifyToken(token)
  if (!payload) return errorResponse('Invalid or expired session', 401)

  try {
    if (!(await isUserGmailEnabled(payload.userId))) return errorResponse('Gmail not connected', 403)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const messageId = String(body.messageId ?? '')
    const mode = body.mode === 'reply' ? 'reply' : 'summarize'
    const instruction = typeof body.instruction === 'string' ? body.instruction : ''
    if (!messageId) return errorResponse('messageId is required', 400)

    const email = await getMessage(payload.userId, { messageId })
    const emailText = `From: ${email.from}\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.body}`

    const system =
      mode === 'reply'
        ? `You are drafting an email reply for the user. Write a concise, professional reply body only — no subject line, no "Dear/Regards" boilerplate unless appropriate.${instruction ? ` Extra instruction: ${instruction}` : ''}`
        : 'Summarize this email in 2–3 short sentences: who it is from, what they want, and any action needed.'

    const messages: ModelMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: emailText },
    ]
    const result = await generate(messages)
    return successResponse({ text: (result.text || '').trim(), mode })
  } catch (error) {
    if (isGoogleReauthError(error)) return errorResponse('Reconnect your Google account to use Mail.', 401)
    return errorResponse(error instanceof Error ? error.message : 'Forgie could not process this email', 500)
  }
}
