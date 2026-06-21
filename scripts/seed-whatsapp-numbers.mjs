/**
 * Seed personalEmail + whatsappNumber for the current team.
 *
 * Dry-run by default. Pass --apply to actually write.
 *
 *   node scripts/seed-whatsapp-numbers.mjs          # preview
 *   node scripts/seed-whatsapp-numbers.mjs --apply  # commit changes
 *
 * Prerequisites:
 *   1. The User.whatsappNumber column must exist in the DB. Run
 *      `pnpm db:push` (or `npx prisma db push`) first.
 *   2. DATABASE_URL must be set in your env / .env.
 *
 * Match strategy: case-insensitive first-name match. For users with
 * a multi-word display name (e.g. "Kavya Jain"), uses the first word.
 * If a name matches 0 or >1 active users, that row is skipped with a
 * loud warning — never blindly updates the wrong person.
 */

import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')

const SEEDS = [
  // [matchName, personalEmail, whatsappNumber]
  ['Abhyam',  'abhyammath78@gmail.com',       '+919140366268'],
  ['Ahmed',   'shadantaiyabi@gmail.com',      '+916388599818'],
  ['Daksh',   'dakshsingh791@gmail.com',      '+919012988881'],
  ['Kavya',   'jainkavyakj123@gmail.com',     '+916396840261'],
  ['Pranav',  'pranavpuri03@gmail.com',       '+919315754266'],
  ['Radhesh', 'radheshtiwaric@gmail.com',     '+917999891702'],
  ['Rohan',   'rohanbatraind@gmail.com',      '+917253069231'],
  ['Sudipta', 'sudiptaj90@gmail.com',         '+917799399762'],
  ['Utkarsh', 'kapoorutkarsh17@gmail.com',    '+918076869691'],
  ['Yash',    '04yash27@gmail.com',           '+919818280093'],
  ['Madhur',  'agg.madhuraggarwal@gmail.com', '+919760007994'],
]

const prisma = new PrismaClient()

async function main() {
  console.log('\n═══════════════════════════════════════════════════════')
  console.log(`SEED — personalEmail + whatsappNumber  (${APPLY ? 'APPLY' : 'DRY-RUN'})`)
  console.log('═══════════════════════════════════════════════════════\n')

  // Pre-flight: does the whatsappNumber column actually exist in the DB?
  // If db:push hasn't run yet, every update will fail — fail loudly upfront.
  try {
    await prisma.$queryRawUnsafe('SELECT "whatsappNumber" FROM "User" LIMIT 1')
  } catch (err) {
    console.error('✗ FATAL: User.whatsappNumber column not found in the database.')
    console.error('  Run `pnpm db:push` (or `npx prisma db push`) first to apply the schema change.')
    console.error('  Underlying error:', err.message)
    process.exit(1)
  }

  let updated = 0
  let unchanged = 0
  let skipped = 0

  for (const [matchName, personalEmail, whatsappNumber] of SEEDS) {
    const candidates = await prisma.user.findMany({
      where: {
        isActive: true,
        name: { contains: matchName, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        email: true,
        personalEmail: true,
        whatsappNumber: true,
      },
    })

    if (candidates.length === 0) {
      console.log(`  ⊘  ${matchName.padEnd(10)} — no active user matched, skipped`)
      skipped++
      continue
    }
    if (candidates.length > 1) {
      console.log(`  ⚠  ${matchName.padEnd(10)} — AMBIGUOUS, ${candidates.length} matches:`)
      for (const c of candidates) console.log(`       · ${c.name} (${c.email})`)
      console.log('       skipped — disambiguate manually')
      skipped++
      continue
    }

    const user = candidates[0]
    const changes = []
    if (user.personalEmail !== personalEmail) {
      changes.push(`personalEmail: ${user.personalEmail ?? '<null>'} → ${personalEmail}`)
    }
    if (user.whatsappNumber !== whatsappNumber) {
      changes.push(`whatsappNumber: ${user.whatsappNumber ?? '<null>'} → ${whatsappNumber}`)
    }

    if (changes.length === 0) {
      console.log(`  ·  ${matchName.padEnd(10)} — already up to date (${user.name})`)
      unchanged++
      continue
    }

    console.log(`  ${APPLY ? '✓' : '→'}  ${matchName.padEnd(10)} — ${user.name} (${user.email})`)
    for (const c of changes) console.log(`       · ${c}`)

    if (APPLY) {
      await prisma.user.update({
        where: { id: user.id },
        data: { personalEmail, whatsappNumber },
      })
    }
    updated++
  }

  console.log('\n── Summary ────────────────────────────────────')
  console.log(`  ${APPLY ? 'Updated' : 'Would update'}: ${updated}`)
  console.log(`  Unchanged: ${unchanged}`)
  console.log(`  Skipped (no match / ambiguous): ${skipped}`)
  if (!APPLY) {
    console.log('\n  Re-run with --apply to commit these changes.')
  }
  console.log('')
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
