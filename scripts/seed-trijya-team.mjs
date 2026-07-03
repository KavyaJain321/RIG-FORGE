/**
 * Seed the TRIJYA FORGE team into the isolated `trijya` Postgres schema.
 *
 * Idempotent (upsert by email). DB URLs are constructed the same way
 * run-trijya.sh does (dev Supabase + &schema=trijya), so run it plainly:
 *
 *   node scripts/seed-trijya-team.mjs
 *
 * Every account starts with the same password and is forced to change it
 * on first login (mustChangePassword). Emails are lower-cased.
 */
import fs from 'node:fs'
import bcrypt from 'bcryptjs'

// ── Build the trijya-schema DB URLs from .env.local (mirror run-trijya.sh) ──
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const pick = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  if (!m) throw new Error(`${k} not found in .env.local`)
  return m[1].trim().replace(/^"|"$/g, '')
}
process.env.DATABASE_URL = `${pick('DATABASE_URL')}&schema=trijya`
process.env.DIRECT_URL = `${pick('DIRECT_URL')}?schema=trijya`

const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient()

const PASSWORD = 'Trijya@2026'

const TEAM = [
  { name: 'Vinay Singh',      email: 'architectvinay@gmail.com',      role: 'SUPER_ADMIN' },
  { name: 'Divyanjali',       email: 'divya.anjali@gmail.com',        role: 'ADMIN' },
  { name: 'Mumraj Singh',     email: 'ar.mumraj@gmail.com',           role: 'EMPLOYEE' },
  { name: 'Sahil Verma',      email: '1sahilverma15@gmail.com',       role: 'EMPLOYEE' },
  { name: 'Harsh Sharma',     email: 'harsh4610sharma@gmail.com',     role: 'EMPLOYEE' },
  { name: 'Lalit Kumar',      email: 'lalitkumarsingh788@gmail.com',  role: 'EMPLOYEE' },
  { name: 'Ar. Archana Singh',email: 'singh.archana9287@gmail.com',   role: 'EMPLOYEE' },
  { name: 'Ganapati',         email: 'ganapatic143@gmail.com',        role: 'EMPLOYEE' },
  { name: 'Pratiksha',        email: 'ranapratiksha.1424@gmail.com',  role: 'EMPLOYEE' },
  { name: 'Anjana Joshi',     email: 'aditri.infrarealty@gmail.com',  role: 'EMPLOYEE' },
]

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  for (const u of TEAM) {
    const email = u.email.toLowerCase()
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: u.name, role: u.role, isActive: true },
      create: {
        name: u.name,
        email,
        passwordHash,
        role: u.role,
        isActive: true,
        isOnboarding: false,
        mustChangePassword: true,
      },
    })
    console.log(`  ✓ ${user.email.padEnd(34)} ${user.role.padEnd(12)} id=${user.id}`)
  }
  const count = await prisma.user.count()
  console.log(`\nTotal users in trijya schema: ${count}`)
  console.log(`Initial password for new accounts: ${PASSWORD} (forced change on first login)`)
}

main()
  .catch((e) => { console.error('❌  Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
