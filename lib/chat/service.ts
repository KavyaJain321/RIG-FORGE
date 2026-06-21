/**
 * Native chat — service layer (Phase 1).
 *
 * Pure data operations over Prisma for 1:1 DMs and group chats. API routes in
 * app/api/chat/* stay thin and call these. Live delivery is handled separately
 * by Supabase Realtime subscribing to the ChatMessage table — these functions
 * only own the durable writes/reads.
 *
 * `ORG` is the single-org tenancy anchor stamped on every row. When real
 * multi-tenancy lands, this becomes the caller's organizationId.
 */
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'

const ORG = 'rig360'

// Stable key for a 1:1 DM: the two user ids sorted + joined, so a unique
// constraint guarantees exactly one DM thread per pair regardless of who
// initiates.
export function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':')
}

const memberUserSelect = { id: true, name: true, avatarUrl: true } as const

// ─── Conversations ─────────────────────────────────────────────────────────

export async function listConversations(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: memberUserSelect } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })

  const rows = await Promise.all(
    memberships.map(async (m) => {
      const convo = m.conversation
      const last = convo.messages[0] ?? null
      const unread = await prisma.chatMessage.count({
        where: {
          conversationId: convo.id,
          senderId: { not: userId },
          deletedAt: null,
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      })
      const others = convo.members
        .filter((mm) => mm.userId !== userId)
        .map((mm) => mm.user)
      return {
        id: convo.id,
        type: convo.type,
        title: convo.type === 'GROUP' ? convo.title : others[0]?.name ?? 'Direct message',
        avatarUrl: convo.type === 'GROUP' ? null : others[0]?.avatarUrl ?? null,
        members: convo.members.map((mm) => mm.user),
        lastMessage: last
          ? { content: last.content, createdAt: last.createdAt, senderId: last.senderId, kind: last.kind }
          : null,
        lastMessageAt: convo.lastMessageAt,
        unread,
      }
    }),
  )

  rows.sort(
    (a, b) =>
      (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
  )
  return rows
}

// Get the existing 1:1 DM for a pair, or create it. Idempotent: the
// (organizationId, dmKey) unique constraint plus a P2002 re-fetch makes
// concurrent "open DM" clicks resolve to the same thread.
export async function getOrCreateDm(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw new Error('Cannot start a DM with yourself')

  const dmKey = dmKeyFor(userId, otherUserId)
  const existing = await prisma.conversation.findFirst({
    where: { organizationId: ORG, type: 'DIRECT', dmKey },
  })
  if (existing) return existing

  try {
    return await prisma.conversation.create({
      data: {
        organizationId: ORG,
        type: 'DIRECT',
        dmKey,
        createdById: userId,
        members: {
          create: [
            { organizationId: ORG, userId },
            { organizationId: ORG, userId: otherUserId },
          ],
        },
      },
    })
  } catch (err) {
    // Lost a create race — the other request made it first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const convo = await prisma.conversation.findFirst({
        where: { organizationId: ORG, type: 'DIRECT', dmKey },
      })
      if (convo) return convo
    }
    throw err
  }
}

export async function createGroup(userId: string, title: string, memberIds: string[]) {
  const ids = Array.from(new Set([userId, ...memberIds]))
  return prisma.conversation.create({
    data: {
      organizationId: ORG,
      type: 'GROUP',
      title,
      createdById: userId,
      members: {
        create: ids.map((id) => ({
          organizationId: ORG,
          userId: id,
          role: id === userId ? 'OWNER' : 'MEMBER',
        })),
      },
    },
  })
}

// ─── Messages ──────────────────────────────────────────────────────────────

async function assertMember(conversationId: string, userId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  if (!member) throw new Error('Not a member of this conversation')
  return member
}

export async function listMessages(
  conversationId: string,
  userId: string,
  opts: { limit?: number; before?: string } = {},
) {
  await assertMember(conversationId, userId)
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100)

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
    include: { sender: { select: memberUserSelect } },
  })
  // Return chronological (oldest → newest) for rendering.
  return messages.reverse()
}

export async function sendMessage(
  conversationId: string,
  userId: string,
  content: string,
) {
  await assertMember(conversationId, userId)
  const text = content.trim()
  if (!text) throw new Error('Message is empty')

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        organizationId: ORG,
        conversationId,
        senderId: userId,
        kind: 'USER',
        type: 'TEXT',
        content: text,
      },
      include: { sender: { select: memberUserSelect } },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
    // Sending counts as reading up to now.
    prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    }),
  ])
  return message
}

export async function markRead(conversationId: string, userId: string) {
  await prisma.conversationMember
    .update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    })
    .catch(() => {
      /* not a member / already gone — nothing to mark */
    })
}
