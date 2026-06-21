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
        avatarUrl: convo.type === 'GROUP' ? convo.imageUrl ?? null : others[0]?.avatarUrl ?? null,
        members: convo.members.map((mm) => ({
          id: mm.user.id,
          name: mm.user.name,
          avatarUrl: mm.user.avatarUrl,
          lastReadAt: mm.lastReadAt,
          role: mm.role,
        })),
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
    // Deleted messages are kept as tombstones ("This message was deleted").
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
    include: { sender: { select: memberUserSelect }, reactions: { select: { emoji: true, userId: true } } },
  })
  // Return chronological (oldest → newest) for rendering.
  return messages.reverse()
}

export async function sendMessage(
  conversationId: string,
  userId: string,
  content: string,
  replyToId?: string | null,
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
        ...(replyToId ? { replyToId } : {}),
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

// ─── Group administration ────────────────────────────────────────────────────

type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER'

async function userName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  return u?.name ?? 'Someone'
}

// Post a SYSTEM line ("Kavya added Pranav") into the group and bump its activity
// so it surfaces in the list — and, via the ChatMessage realtime INSERT, makes
// every member's client refresh (which is how name/photo/member changes
// propagate live without a separate subscription).
async function postSystemMessage(conversationId: string, content: string) {
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: { organizationId: ORG, conversationId, senderId: null, kind: 'SYSTEM', type: 'TEXT', content },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
  ])
}

async function requireGroupAdmin(conversationId: string, userId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  if (!member) throw new Error('Not a member of this conversation')
  if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
    throw new Error('Only group admins can do this')
  }
  return member
}

export async function renameGroup(conversationId: string, userId: string, title: string) {
  await requireGroupAdmin(conversationId, userId)
  const clean = title.trim()
  if (!clean) throw new Error('Group name cannot be empty')
  await prisma.conversation.update({ where: { id: conversationId }, data: { title: clean } })
  await postSystemMessage(conversationId, `${await userName(userId)} changed the group name to "${clean}"`)
}

export async function setGroupImage(conversationId: string, userId: string, imageUrl: string) {
  await requireGroupAdmin(conversationId, userId)
  await prisma.conversation.update({ where: { id: conversationId }, data: { imageUrl } })
  await postSystemMessage(conversationId, `${await userName(userId)} changed the group photo`)
}

export async function addGroupMembers(conversationId: string, userId: string, newMemberIds: string[]) {
  await requireGroupAdmin(conversationId, userId)
  const existing = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  })
  const existingIds = new Set(existing.map((e) => e.userId))
  const toAdd = Array.from(new Set(newMemberIds)).filter((id) => id && !existingIds.has(id))
  if (toAdd.length === 0) return
  await prisma.conversationMember.createMany({
    data: toAdd.map((id) => ({ organizationId: ORG, conversationId, userId: id, role: 'MEMBER' as MemberRole })),
    skipDuplicates: true,
  })
  const added = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { name: true } })
  await postSystemMessage(conversationId, `${await userName(userId)} added ${added.map((a) => a.name).join(', ')}`)
}

export async function removeGroupMember(conversationId: string, userId: string, targetUserId: string) {
  await requireGroupAdmin(conversationId, userId)
  if (targetUserId === userId) throw new Error('Use "leave" to remove yourself')
  const target = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  })
  if (!target) return
  if (target.role === 'OWNER') throw new Error('Cannot remove the group owner')
  const name = await userName(targetUserId)
  await prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  })
  await postSystemMessage(conversationId, `${await userName(userId)} removed ${name}`)
}

export async function setMemberRole(
  conversationId: string,
  userId: string,
  targetUserId: string,
  role: 'ADMIN' | 'MEMBER',
) {
  await requireGroupAdmin(conversationId, userId)
  if (role !== 'ADMIN' && role !== 'MEMBER') throw new Error('Invalid role')
  const target = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  })
  if (!target) throw new Error('Not a member of this conversation')
  if (target.role === 'OWNER') throw new Error('Cannot change the group owner')
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
    data: { role },
  })
  const verb = role === 'ADMIN' ? 'is now an admin' : 'is no longer an admin'
  await postSystemMessage(conversationId, `${await userName(targetUserId)} ${verb}`)
}

export async function leaveGroup(conversationId: string, userId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  if (!member) return
  const name = await userName(userId)
  await prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId, userId } },
  })
  await postSystemMessage(conversationId, `${name} left`)
}

// ─── Delivery acks + media ───────────────────────────────────────────────────

// A recipient's client calls this when it RECEIVES a message (the double-grey
// "delivered" tick). Set once, by a member who isn't the sender.
export async function markDelivered(messageId: string, userId: string) {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, deliveredAt: true, conversationId: true },
  })
  if (!msg || msg.deliveredAt || msg.senderId === userId) return
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: msg.conversationId, userId } },
    select: { userId: true },
  })
  if (!member) return
  await prisma.chatMessage.update({ where: { id: messageId }, data: { deliveredAt: new Date() } })
}

// Create an IMAGE/FILE message whose `content` is the uploaded media URL.
export async function sendMediaMessage(
  conversationId: string,
  userId: string,
  mediaType: 'IMAGE' | 'FILE',
  url: string,
) {
  await assertMember(conversationId, userId)
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { organizationId: ORG, conversationId, senderId: userId, kind: 'USER', type: mediaType, content: url },
      include: { sender: { select: memberUserSelect } },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    }),
  ])
  return message
}

// ─── Edit / delete ───────────────────────────────────────────────────────────

const EDIT_WINDOW_MS = 15 * 60 * 1000

export async function editMessage(messageId: string, userId: string, content: string) {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, createdAt: true, deletedAt: true, type: true },
  })
  if (!msg) throw new Error('Message not found')
  if (msg.senderId !== userId) throw new Error('You can only edit your own messages')
  if (msg.deletedAt) throw new Error('Cannot edit a deleted message')
  if (msg.type !== 'TEXT') throw new Error('Only text messages can be edited')
  if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw new Error('The edit window has passed')
  }
  const text = content.trim()
  if (!text) throw new Error('Message cannot be empty')
  return prisma.chatMessage.update({
    where: { id: messageId },
    data: { content: text, editedAt: new Date() },
    include: { sender: { select: memberUserSelect } },
  })
}

export async function deleteForEveryone(messageId: string, userId: string) {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, deletedAt: true },
  })
  if (!msg) throw new Error('Message not found')
  if (msg.senderId !== userId) throw new Error('You can only delete your own messages')
  if (msg.deletedAt) return
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), content: '' },
  })
}

// ─── Reactions ───────────────────────────────────────────────────────────────

// One reaction per user per message: same emoji toggles off, a new emoji replaces.
export async function setReaction(messageId: string, userId: string, emoji: string) {
  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { conversationId: true } })
  if (!msg) throw new Error('Message not found')
  await assertMember(msg.conversationId, userId)

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId: { messageId, userId } },
  })
  if (existing) {
    if (existing.emoji === emoji) {
      await prisma.messageReaction.delete({ where: { messageId_userId: { messageId, userId } } })
      return
    }
    await prisma.messageReaction.update({
      where: { messageId_userId: { messageId, userId } },
      data: { emoji },
    })
    return
  }
  await prisma.messageReaction.create({ data: { messageId, userId, emoji } })
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function searchMessages(conversationId: string, userId: string, q: string) {
  await assertMember(conversationId, userId)
  const query = q.trim()
  if (!query) return []
  return prisma.chatMessage.findMany({
    where: {
      conversationId,
      deletedAt: null,
      kind: 'USER',
      type: 'TEXT',
      content: { contains: query, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { sender: { select: memberUserSelect } },
  })
}
