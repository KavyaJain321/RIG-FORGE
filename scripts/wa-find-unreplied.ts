/**
 * READ-ONLY investigation: find WhatsApp conversations whose most recent
 * message is from the USER (i.e. Forgie never replied — typically because
 * the LLM step failed during an outage). Sends nothing.
 *
 * Run: npx tsx scripts/wa-find-unreplied.ts
 */
import { prisma } from '../lib/db'

async function main() {
  const convos = await prisma.assistantConversation.findMany({
    where: { channel: 'WHATSAPP', isArchived: false },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      user: { select: { id: true, name: true, whatsappNumber: true, isActive: true } },
      messages: {
        where: { role: { in: ['USER', 'ASSISTANT'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { role: true, content: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const unreplied = convos.filter(
    (c) => c.messages[0]?.role === 'USER',
  )

  console.log(`\nTotal WHATSAPP conversations: ${convos.length}`)
  console.log(`Unreplied (last msg is USER): ${unreplied.length}\n`)

  for (const c of unreplied) {
    const last = c.messages[0]
    const isGroup = /group/i.test(c.title ?? '')
    console.log('─'.repeat(70))
    console.log(`convId:   ${c.id}`)
    console.log(`user:     ${c.user?.name} (${c.user?.whatsappNumber ?? 'no number'})${c.user?.isActive ? '' : ' [INACTIVE]'}`)
    console.log(`type:     ${isGroup ? 'GROUP (no JID stored — cannot auto-reply)' : 'DM'}`)
    console.log(`when:     ${last?.createdAt.toISOString()}`)
    console.log(`message:  ${last?.content.slice(0, 200)}`)
  }
  console.log('─'.repeat(70))
  console.log(`\n${unreplied.length} unreplied. ${unreplied.filter((c) => !/group/i.test(c.title ?? '') && c.user?.whatsappNumber && c.user?.isActive).length} are DMs to active users with a number (auto-repliable).\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
