/**
 * One-time backfill: send a "finish setting up" reminder notification to every
 * active member, prompting them to connect Google + verify their WhatsApp
 * number. Clicking it opens /dashboard/profile.
 *
 * Idempotent: skips any user who already has a notification with this exact
 * title, so re-running won't create duplicates. New members get the equivalent
 * message automatically via the first-login WELCOME notification.
 *
 *   node scripts/backfill-setup-reminder.mjs           # dry run
 *   node scripts/backfill-setup-reminder.mjs --apply   # actually send
 */

import { PrismaClient } from '../node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

const TITLE = 'Finish setting up your account'
const BODY =
  'Connect your Google account and verify your WhatsApp number so Forgie can ' +
  'manage your calendar, email and messages for you. Tap here to open your profile.'
const LINK = '/dashboard/profile'

const APPLY = process.argv.includes('--apply')

const users = await prisma.user.findMany({
  where: { isActive: true, isOnboarding: false },
  select: { id: true, name: true },
})

let created = 0
let skipped = 0

for (const u of users) {
  const existing = await prisma.notification.findFirst({
    where: { userId: u.id, title: TITLE },
    select: { id: true },
  })
  if (existing) {
    skipped++
    continue
  }
  if (APPLY) {
    await prisma.notification.create({
      data: { userId: u.id, type: 'WELCOME', title: TITLE, body: BODY, linkTo: LINK },
    })
  }
  created++
  console.log(`  ${APPLY ? 'SENT' : 'WOULD SEND'} → ${u.name}`)
}

console.log(`\nActive members: ${users.length}`)
console.log(`${APPLY ? 'Created' : 'Would create'}: ${created} · Skipped (already had it): ${skipped}`)
if (!APPLY) console.log('\n(dry run — re-run with --apply to send)')

await prisma.$disconnect()
