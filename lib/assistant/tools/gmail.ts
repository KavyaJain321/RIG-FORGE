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

/**
 * The `gmail.metadata` scope (what new connections get — gmail.readonly is a
 * RESTRICTED scope we avoid) does NOT allow the `q` search parameter: any q,
 * even "in:inbox", returns a 403 "Metadata scope does not support 'q'". So for
 * metadata connections we list by labelIds and filter client-side instead.
 */
async function connectionSupportsQuery(userId: string): Promise<boolean> {
  const integ = await prisma.googleIntegration.findUnique({
    where: { userId },
    select: { scopes: true },
  })
  return !!integ && integ.scopes.includes('gmail.readonly')
}

/** Translate a Gmail query into (labelIds, plain filter terms) for metadata mode. */
function queryToLabelsAndTerms(q: string): { labelIds: string[]; terms: string[] } {
  const labelIds: string[] = /\bin:sent\b/i.test(q) ? ['SENT'] : ['INBOX']
  if (/\bis:unread\b/i.test(q)) labelIds.push('UNREAD')
  const terms: string[] = []
  // from:/to:/cc: values (addresses or domains) — the team filter uses these
  const re = /\b(?:from|to|cc):([^\s{}]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(q))) terms.push(m[1])
  // leftover free text, operators stripped
  const free = q
    .replace(/\b(?:from|to|cc|in|is|subject|after|before|older|newer|label|has|category):[^\s{}]+/gi, '')
    .replace(/[{}]/g, ' ')
    .trim()
  for (const w of free.split(/\s+/)) if (w.length > 1) terms.push(w)
  return { labelIds, terms: [...new Set(terms.map((t) => t.toLowerCase()))] }
}

export async function searchMessages(userId: string, args: SearchArgs) {
  const auth = await getAuthorizedClient(userId)
  const gmail = google.gmail({ version: 'v1', auth })

  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)
  const canQuery = await connectionSupportsQuery(userId)

  let ids: Array<{ id?: string | null }>
  let clientTerms: string[] = []
  if (canQuery) {
    const list = await gmail.users.messages.list({ userId: 'me', q: args.query, maxResults: limit })
    ids = list.data.messages ?? []
  } else {
    // metadata scope: no `q` — list by label, over-fetch, filter client-side
    const { labelIds, terms } = queryToLabelsAndTerms(args.query)
    clientTerms = terms
    const list = await gmail.users.messages.list({
      userId: 'me',
      labelIds,
      maxResults: terms.length ? Math.min(limit * 5, 100) : limit,
    })
    ids = list.data.messages ?? []
  }

  if (ids.length === 0) {
    return { query: args.query, matches: 0, messages: [] }
  }

  // Fetch metadata for each. We only request specific headers to keep it fast.
  const fetched = await Promise.all(
    ids.map(async (m) => {
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

  let messages = fetched.filter((m): m is NonNullable<typeof m> => m !== null)

  // metadata mode: apply the query terms client-side (server-side `q` was not
  // available). Empty terms = a plain inbox listing, so keep everything.
  if (!canQuery && clientTerms.length) {
    messages = messages.filter((m) => {
      const hay = `${m.from ?? ''} ${m.to ?? ''} ${m.subject ?? ''} ${m.snippet ?? ''}`.toLowerCase()
      return clientTerms.some((t) => hay.includes(t))
    })
  }
  messages = messages.slice(0, limit)

  return {
    query: args.query,
    matches: messages.length,
    messages,
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

export interface SendAttachment {
  filename: string
  mimeType: string
  content: Buffer
}

export interface SendArgs {
  to: string                // single recipient or comma-separated
  subject: string
  body: string              // plain text (recommended) or HTML
  cc?: string
  bcc?: string
  isHtml?: boolean
  attachments?: SendAttachment[]
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
  const headers: string[] = []
  headers.push(`To: ${args.to}`)
  if (args.cc) headers.push(`Cc: ${args.cc}`)
  if (args.bcc) headers.push(`Bcc: ${args.bcc}`)
  headers.push(`Subject: ${encodeRFC2047(args.subject)}`)
  headers.push('MIME-Version: 1.0')

  let message: string
  const atts = args.attachments ?? []
  if (atts.length === 0) {
    // Simple single-part message.
    message = [
      ...headers,
      `Content-Type: ${args.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(args.body, 'utf-8').toString('base64'),
    ].join('\r\n')
  } else {
    // multipart/mixed: body part + one part per attachment.
    const boundary = `rfnas_${Date.now().toString(36)}_${Math.round(Math.random() * 1e9).toString(36)}`
    const parts: string[] = [
      `Content-Type: ${args.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(args.body, 'utf-8').toString('base64'),
    ]
    const attParts = atts.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; name="${a.filename.replace(/"/g, '')}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${a.filename.replace(/"/g, '')}"`,
      '',
      a.content.toString('base64').replace(/(.{76})/g, '$1\r\n'),
    ])
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      ...parts,
      ...attParts,
      `--${boundary}--`,
    ].join('\r\n')
  }

  // URL-safe base64 for Gmail API
  return Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Best-effort MIME type from a filename extension (for NAS attachments).
export function guessMimeType(name: string): string {
  const x = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || ''
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip', dwg: 'application/acad',
  }
  return map[x] || 'application/octet-stream'
}

function encodeRFC2047(text: string): string {
  // If subject has non-ASCII, encode as MIME-encoded-word per RFC 2047
  if (/^[\x00-\x7F]*$/.test(text)) return text
  const b64 = Buffer.from(text, 'utf-8').toString('base64')
  return `=?UTF-8?B?${b64}?=`
}
