/**
 * Gmail tools for Forgie.
 *
 * Per-user — uses the caller's stored Google OAuth tokens. The user must
 * have authorized at least one of gmail.send or gmail.readonly during the
 * Connect Google flow. If the scope is missing, calls return a
 * recognizable error so the LLM can ask the user to reconnect.
 */

import { google } from 'googleapis'
import { prisma } from '@/lib/db'
import {
  getAuthorizedClient,
  isGoogleConfigured,
  scopesIncludeGmail,
} from '@/lib/google/oauth'

export function isGmailConfigured(): boolean {
  return isGoogleConfigured()
}

export async function isUserGmailEnabled(userId: string): Promise<boolean> {
  if (!isGoogleConfigured()) return false
  const integ = await prisma.googleIntegration.findUnique({
    where: { userId },
    select: { scopes: true },
  })
  return integ !== null && scopesIncludeGmail(integ.scopes)
}

// ─── Tool: search ────────────────────────────────────────────────────────────

export interface SearchArgs {
  /** Gmail search query — supports the full Gmail filter syntax (from:, subject:, after:, etc.) */
  query: string
  limit?: number
}

export async function searchMessages(userId: string, args: SearchArgs) {
  const auth = await getAuthorizedClient(userId)
  const gmail = google.gmail({ version: 'v1', auth })

  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: args.query,
    maxResults: limit,
  })

  const ids = list.data.messages ?? []
  if (ids.length === 0) {
    return { query: args.query, matches: 0, messages: [] }
  }

  // Fetch metadata for each. We only request specific headers to keep it fast.
  const messages = await Promise.all(
    ids.slice(0, limit).map(async (m) => {
      if (!m.id) return null
      const r = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      })
      const headers = r.data.payload?.headers ?? []
      const get = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null
      return {
        id: m.id,
        threadId: r.data.threadId,
        from: get('From'),
        to: get('To'),
        subject: get('Subject'),
        date: get('Date'),
        snippet: r.data.snippet ?? null,
        labels: r.data.labelIds ?? [],
        isUnread: (r.data.labelIds ?? []).includes('UNREAD'),
      }
    }),
  )

  return {
    query: args.query,
    matches: list.data.resultSizeEstimate ?? messages.length,
    messages: messages.filter((m): m is NonNullable<typeof m> => m !== null),
  }
}

// ─── Tool: get message ───────────────────────────────────────────────────────

export interface GetMessageArgs {
  messageId: string
}

export async function getMessage(userId: string, args: GetMessageArgs) {
  const auth = await getAuthorizedClient(userId)
  const gmail = google.gmail({ version: 'v1', auth })

  // Try 'full' (reads the body) — works for legacy connections that still hold
  // the gmail.readonly scope. New connections use gmail.metadata, which rejects
  // 'full'/'raw'; we fall back to 'metadata' (headers + snippet, no body).
  let r
  let bodyAvailable = true
  try {
    r = await gmail.users.messages.get({
      userId: 'me',
      id: args.messageId,
      format: 'full',
    })
  } catch {
    bodyAvailable = false
    r = await gmail.users.messages.get({
      userId: 'me',
      id: args.messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
    })
  }

  const headers = r.data.payload?.headers ?? []
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null

  // With metadata-only access we can't read the body — return the snippet and a
  // flag so the caller/LLM knows the full body isn't available.
  const body = bodyAvailable
    ? extractPlainText(r.data.payload)
    : (r.data.snippet ?? '')

  return {
    id: args.messageId,
    threadId: r.data.threadId,
    from: get('From'),
    to: get('To'),
    cc: get('Cc'),
    subject: get('Subject'),
    date: get('Date'),
    body: body.length > 5000 ? body.slice(0, 5000) + '\n\n... (truncated)' : body,
    bodyTruncatedToSnippet: !bodyAvailable,
    labels: r.data.labelIds ?? [],
  }
}

// ─── Write: send message (gated) ─────────────────────────────────────────────

export interface SendArgs {
  to: string                // single recipient or comma-separated
  subject: string
  body: string              // plain text (recommended) or HTML
  cc?: string
  bcc?: string
  isHtml?: boolean
}

export async function sendMessage(userId: string, args: SendArgs) {
  const auth = await getAuthorizedClient(userId)
  const gmail = google.gmail({ version: 'v1', auth })

  // Build RFC 2822 message
  const raw = buildRawMessage(args)

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return {
    id: res.data.id ?? null,
    threadId: res.data.threadId ?? null,
    to: args.to,
    subject: args.subject,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Loose shape for the recursive walk — Gmail message payloads nest themselves
// inside `.parts`, and full typing is gnarly. We only need a few fields.
interface Payload {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: Payload[] | null
}

function extractPlainText(payload: Payload | null | undefined): string {
  if (!payload) return ''
  // Single-part text body
  if (payload.body?.data && payload.mimeType?.startsWith('text/plain')) {
    return decodeBody(payload.body.data)
  }
  // Multi-part: prefer text/plain over text/html
  if (payload.parts && payload.parts.length > 0) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBody(plain.body.data)
    const html = payload.parts.find((p) => p.mimeType === 'text/html')
    if (html?.body?.data) return stripHtml(decodeBody(html.body.data))
    // Nested multipart
    for (const part of payload.parts) {
      const found = extractPlainText(part as Payload)
      if (found) return found
    }
  }
  // Fallback: HTML body at top level
  if (payload.body?.data && payload.mimeType?.startsWith('text/html')) {
    return stripHtml(decodeBody(payload.body.data))
  }
  return ''
}

function decodeBody(data: string): string {
  // Gmail uses url-safe base64
  const normal = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Buffer.from(normal, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function stripHtml(html: string): string {
  // Minimal HTML stripper — good enough for chat display
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildRawMessage(args: SendArgs): string {
  const lines: string[] = []
  lines.push(`To: ${args.to}`)
  if (args.cc) lines.push(`Cc: ${args.cc}`)
  if (args.bcc) lines.push(`Bcc: ${args.bcc}`)
  lines.push(`Subject: ${encodeRFC2047(args.subject)}`)
  lines.push('MIME-Version: 1.0')
  lines.push(`Content-Type: ${args.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`)
  lines.push('Content-Transfer-Encoding: base64')
  lines.push('')
  lines.push(Buffer.from(args.body, 'utf-8').toString('base64'))

  const message = lines.join('\r\n')
  // URL-safe base64 for Gmail API
  return Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function encodeRFC2047(text: string): string {
  // If subject has non-ASCII, encode as MIME-encoded-word per RFC 2047
  if (/^[\x00-\x7F]*$/.test(text)) return text
  const b64 = Buffer.from(text, 'utf-8').toString('base64')
  return `=?UTF-8?B?${b64}?=`
}
