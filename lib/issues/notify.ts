import { prisma } from '@/lib/db'
import { sendMessage, type SendAttachment } from '@/lib/assistant/tools/gmail'

// Developer inbox that receives every new issue. Overridable via env so it can
// be changed without a code deploy.
const NOTIFY_TO = process.env.ISSUE_NOTIFY_EMAIL || 'jainkavyakj123@gmail.com'
// Preferred sender: the developer's own connected Google account.
const PREFERRED_SENDER_EMAIL = 'kavya@rigforge.com'

export interface IssueEmailInput {
  id: string
  title: string
  description: string
  reporterName: string
  reporterEmail: string
  organizationId: string
  pageUrl?: string | null
  userAgent?: string | null
  appUrl?: string | null
  image?: SendAttachment | null
}

/**
 * Pick a user whose connected Gmail we can send through. Uses a raw query so the
 * org-scope extension does NOT filter it — the sender may live in a different org
 * than the reporter (the Gmail token fetch is keyed by userId, org-agnostic).
 * Prefers the developer's own inbox, falls back to any connected account.
 */
async function resolveSenderUserId(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT u.id
    FROM "User" u
    JOIN "GoogleIntegration" g ON g."userId" = u.id
    ORDER BY (u.email = ${PREFERRED_SENDER_EMAIL}) DESC
    LIMIT 1`
  return rows[0]?.id ?? null
}

/**
 * Email the developer about a newly filed issue. Best-effort: a failure here must
 * never fail the issue submission, so callers should not await-throw on it.
 */
export async function notifyIssueByEmail(
  input: IssueEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const senderId = await resolveSenderUserId()
    if (!senderId) return { sent: false, error: 'no connected Google account to send from' }

    const body = [
      `A new issue was reported in "${input.organizationId}".`,
      '',
      `Title:       ${input.title}`,
      `Reported by: ${input.reporterName} <${input.reporterEmail}>`,
      input.pageUrl ? `Page:        ${input.pageUrl}` : '',
      input.userAgent ? `Device:      ${input.userAgent}` : '',
      '',
      'Description',
      '-----------',
      input.description,
      '',
      input.appUrl ? `Open issues list: ${input.appUrl}/dashboard/issues` : '',
      `Issue ID: ${input.id}`,
      input.image ? '' : '(no screenshot attached)',
    ]
      .filter((l) => l !== '')
      .join('\n')

    await sendMessage(senderId, {
      to: NOTIFY_TO,
      subject: `[Forge issue] ${input.title}`,
      body,
      attachments: input.image ? [input.image] : undefined,
    })
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}
