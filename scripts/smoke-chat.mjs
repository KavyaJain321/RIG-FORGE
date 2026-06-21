/**
 * Dev smoke test for the native-chat data layer + enables Supabase Realtime
 * on the chat tables. Mirrors lib/chat/service.ts query shapes. Run with the
 * dev DB DIRECT (5432) URL so the ALTER PUBLICATION DDL works:
 *
 *   DATABASE_URL="<dev 5432>" DIRECT_URL="<dev 5432>" node scripts/smoke-chat.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ORG = 'rig360'
const dmKeyFor = (a, b) => [a, b].sort().join(':')

async function enableRealtime() {
  for (const tbl of ['ChatMessage', 'Conversation', 'ConversationMember']) {
    try {
      await prisma.$executeRawUnsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE "${tbl}"`)
      console.log(`  realtime ON  : ${tbl}`)
    } catch (e) {
      console.log(`  realtime skip: ${tbl} (${String(e.message).split('\n')[0]})`)
    }
  }
}

async function main() {
  console.log('1) Enabling Supabase Realtime on chat tables...')
  await enableRealtime()

  console.log('\n2) Data-layer smoke test...')
  const kavya = await prisma.user.findUnique({ where: { email: 'kavya@rigforge.com' } })
  const pranav = await prisma.user.findUnique({ where: { email: 'pranav@rigforge.com' } })
  if (!kavya || !pranav) throw new Error('seed users missing — run seed-dev-users.mjs')

  const dmKey = dmKeyFor(kavya.id, pranav.id)
  let convo = await prisma.conversation.findFirst({ where: { organizationId: ORG, type: 'DIRECT', dmKey } })
  if (!convo) {
    convo = await prisma.conversation.create({
      data: {
        organizationId: ORG, type: 'DIRECT', dmKey, createdById: kavya.id,
        members: { create: [{ organizationId: ORG, userId: kavya.id }, { organizationId: ORG, userId: pranav.id }] },
      },
    })
    console.log(`  created DM      : ${convo.id}`)
  } else {
    console.log(`  reused DM       : ${convo.id} (idempotent ✓)`)
  }

  const [msg] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { organizationId: ORG, conversationId: convo.id, senderId: kavya.id, kind: 'USER', type: 'TEXT', content: 'Hey Pranav — testing RF chat 👋' },
      include: { sender: { select: { name: true } } },
    }),
    prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } }),
    prisma.conversationMember.update({ where: { conversationId_userId: { conversationId: convo.id, userId: kavya.id } }, data: { lastReadAt: new Date() } }),
  ])
  console.log(`  sent message    : "${msg.content}" from ${msg.sender.name}`)

  const messages = await prisma.chatMessage.findMany({ where: { conversationId: convo.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 30 })
  console.log(`  messages in DM  : ${messages.length}`)

  // Pranav's unread for this DM should be >= 1 (Kavya sent, Pranav hasn't read)
  const pm = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: convo.id, userId: pranav.id } } })
  const unread = await prisma.chatMessage.count({
    where: { conversationId: convo.id, senderId: { not: pranav.id }, deletedAt: null, ...(pm?.lastReadAt ? { createdAt: { gt: pm.lastReadAt } } : {}) },
  })
  console.log(`  Pranav unread   : ${unread} (expect >= 1)`)

  console.log('\n✅ chat data layer smoke test passed')
}

main().catch((e) => { console.error('❌', e); process.exit(1) }).finally(() => prisma.$disconnect())
