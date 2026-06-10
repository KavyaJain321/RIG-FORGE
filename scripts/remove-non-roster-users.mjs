import { PrismaClient } from '../node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

// Everyone we KEEP. Rohit (owner / SUPER_ADMIN) is kept even though he is
// not on the team roster. Everyone else in the DB gets hard-deleted.
const KEEP_EMAILS = new Set([
  'abhyam@rigforge.com',
  'ahmed@rigforge.com',
  'daksh@rigforge.com',
  'kashvi@rigforge.com',
  'kavya@rigforge.com',
  'pankaj@rigforge.com',
  'pranavv@rigforge.com',
  'rhadesh@rigforge.com', // Radhesh (note existing spelling)
  'rohun@rigforge.com',   // Rohan
  'shubham@rigforge.com',
  'sudipta@rigforge.com',
  'utkarsh@rigforge.com',
  'yash@rigforge.com',
  'madhur@rigforge.com',
  'rohit@rigforge.com',   // owner — explicitly kept
])

const EXECUTE = process.argv.includes('--execute')

const all = await prisma.user.findMany({
  select: { id: true, name: true, email: true, role: true },
  orderBy: { name: 'asc' },
})

const toDelete = all.filter((u) => !KEEP_EMAILS.has(u.email.toLowerCase()))
const ids = toDelete.map((u) => u.id)

console.log(`Total users: ${all.length}`)
console.log(`Keeping:     ${all.length - toDelete.length}`)
console.log(`Deleting:    ${toDelete.length}\n`)
console.log('Will DELETE:')
for (const u of toDelete) console.log(`  - ${u.name.padEnd(20)} ${u.email.padEnd(28)} ${u.role}`)

if (toDelete.some((u) => u.role === 'SUPER_ADMIN')) {
  console.error('\n!! Refusing: a SUPER_ADMIN is in the delete set. Aborting.')
  await prisma.$disconnect()
  process.exit(1)
}

if (!EXECUTE) {
  console.log('\n(dry run — re-run with --execute to perform deletion)')
  await prisma.$disconnect()
  process.exit(0)
}

console.log('\nExecuting deletion in a transaction...')

const result = await prisma.$transaction(async (tx) => {
  const counts = {}

  // Null out project leadership held by deleted users (optional FK).
  counts.projectsLedNulled = (
    await tx.project.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null } })
  ).count

  // Tickets raised by them — delete (cascades their TicketComments).
  counts.tickets = (await tx.ticket.deleteMany({ where: { raisedById: { in: ids } } })).count
  // Comments they authored on OTHER (surviving) tickets.
  counts.ticketComments = (await tx.ticketComment.deleteMany({ where: { authorId: { in: ids } } })).count
  // Thread messages they authored.
  counts.threadMessages = (await tx.threadMessage.deleteMany({ where: { authorId: { in: ids } } })).count
  // Forgie assistant data (messages cascade from conversation).
  counts.assistantConversations = (await tx.assistantConversation.deleteMany({ where: { userId: { in: ids } } })).count
  counts.assistantUsage = (await tx.assistantUsage.deleteMany({ where: { userId: { in: ids } } })).count
  counts.assistantAuditLogs = (await tx.assistantAuditLog.deleteMany({ where: { userId: { in: ids } } })).count
  // Logs / activity / drafts / notifications / memberships.
  counts.dailyLogDrafts = (await tx.dailyLogDraft.deleteMany({ where: { userId: { in: ids } } })).count
  counts.dailyLogs = (await tx.dailyLog.deleteMany({ where: { userId: { in: ids } } })).count
  counts.dailyActivities = (await tx.dailyActivity.deleteMany({ where: { userId: { in: ids } } })).count
  counts.notifications = (await tx.notification.deleteMany({ where: { userId: { in: ids } } })).count
  counts.projectMembers = (await tx.projectMember.deleteMany({ where: { userId: { in: ids } } })).count
  // GoogleIntegration cascades on user delete; Task.assigneeId / Ticket.helperId set null automatically.
  counts.users = (await tx.user.deleteMany({ where: { id: { in: ids } } })).count

  return counts
})

console.log('\nDone. Deleted record counts:')
console.log(JSON.stringify(result, null, 2))

await prisma.$disconnect()
