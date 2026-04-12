import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@5.16.1_prisma@5.16.1/node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

async function main() {
  console.log('\n═══════════════════════════════════════')
  console.log('TASK 1 — MERGE "Video Editing" + "Integration"')
  console.log('═══════════════════════════════════════\n')

  // 1. Fetch both projects with all counts
  const [ve, integ] = await Promise.all([
    prisma.project.findFirst({
      where: { name: { equals: 'Video Editing', mode: 'insensitive' } },
      include: {
        members: true,
        tasks: true,
        tickets: true,
        thread: { include: { messages: true } },
      },
    }),
    prisma.project.findFirst({
      where: { name: { equals: 'Integration', mode: 'insensitive' } },
      include: {
        members: true,
        tasks: true,
        tickets: true,
        thread: { include: { messages: true } },
      },
    }),
  ])

  if (!ve) throw new Error('"Video Editing" project not found')
  if (!integ) throw new Error('"Integration" project not found')

  const veScore =
    ve.members.length + ve.tasks.length + ve.tickets.length + (ve.thread?.messages.length ?? 0)
  const integScore =
    integ.members.length + integ.tasks.length + integ.tickets.length + (integ.thread?.messages.length ?? 0)

  console.log(`"Video Editing" (${ve.id}): members=${ve.members.length}, tasks=${ve.tasks.length}, tickets=${ve.tickets.length}, messages=${ve.thread?.messages.length ?? 0} → score=${veScore}`)
  console.log(`"Integration"   (${integ.id}): members=${integ.members.length}, tasks=${integ.tasks.length}, tickets=${integ.tickets.length}, messages=${integ.thread?.messages.length ?? 0} → score=${integScore}`)

  const primary = veScore >= integScore ? ve : integ
  const secondary = primary === ve ? integ : ve
  console.log(`\n→ PRIMARY: "${primary.name}" (${primary.id})`)
  console.log(`→ SECONDARY (to be soft-deleted): "${secondary.name}" (${secondary.id})\n`)

  let migrated = 0

  // 2. Migrate ProjectMember rows (skip duplicates)
  const existingMemberUserIds = new Set(primary.members.map((m) => m.userId))
  for (const m of secondary.members) {
    if (existingMemberUserIds.has(m.userId)) {
      console.log(`  SKIP duplicate member userId=${m.userId}`)
    } else {
      await prisma.projectMember.create({
        data: {
          userId: m.userId,
          projectId: primary.id,
          contribution: m.contribution,
          joinedAt: m.joinedAt,
        },
      })
      console.log(`  Migrated ProjectMember: userId=${m.userId} → projectId=${primary.id}`)
      migrated++
    }
  }

  // 3. Migrate Tasks
  for (const t of secondary.tasks) {
    await prisma.task.update({ where: { id: t.id }, data: { projectId: primary.id } })
    console.log(`  Migrated Task: "${t.title}" (${t.id}) → projectId=${primary.id}`)
    migrated++
  }

  // 4. Migrate Tickets
  for (const tk of secondary.tickets) {
    await prisma.ticket.update({ where: { id: tk.id }, data: { projectId: primary.id } })
    console.log(`  Migrated Ticket: "${tk.title}" (${tk.id}) → projectId=${primary.id}`)
    migrated++
  }

  // 5. Migrate ProjectThread messages
  if (secondary.thread && secondary.thread.messages.length > 0) {
    // Ensure primary has a thread
    let primaryThread = primary.thread
    if (!primaryThread) {
      primaryThread = await prisma.projectThread.create({ data: { projectId: primary.id } })
      console.log(`  Created ProjectThread for primary (${primaryThread.id})`)
    }
    for (const msg of secondary.thread.messages) {
      await prisma.threadMessage.update({
        where: { id: msg.id },
        data: { projectThreadId: primaryThread.id },
      })
      console.log(`  Migrated ThreadMessage: ${msg.id} → thread=${primaryThread.id}`)
      migrated++
    }
    // Remove orphaned secondary thread
    await prisma.projectThread.delete({ where: { id: secondary.thread.id } })
    console.log(`  Deleted orphaned ProjectThread: ${secondary.thread.id}`)
  }

  // 6. Rename primary to "Video Editing & Integration"
  await prisma.project.update({
    where: { id: primary.id },
    data: { name: 'Video Editing & Integration' },
  })
  console.log(`\n  Renamed primary project → "Video Editing & Integration"`)

  // 7. Soft-delete secondary
  await prisma.project.update({ where: { id: secondary.id }, data: { isActive: false } })
  console.log(`  Soft-deleted secondary project: "${secondary.name}" (${secondary.id})`)

  console.log(`\nTotal rows migrated: ${migrated}`)
  console.log('\n✅ DONE — TASK 1 COMPLETE')
  console.log('  Merged "Video Editing" + "Integration" → "Video Editing & Integration"')
  console.log(`  Primary ID: ${primary.id} | Secondary soft-deleted: ${secondary.id}`)
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
