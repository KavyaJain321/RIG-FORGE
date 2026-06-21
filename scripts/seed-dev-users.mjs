/**
 * Seed test users into the DEV Supabase DB so we can log in and test native chat.
 * Idempotent (upsert by email). Run with the dev DB URLs passed inline:
 *
 *   DATABASE_URL="<dev 6543>" DIRECT_URL="<dev 5432>" node scripts/seed-dev-users.mjs
 *
 * All accounts share the same password (see PASSWORD below). Dev-only.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const PASSWORD = 'test1234'

const USERS = [
  { name: 'Rohit (Test)', email: 'admin@rigforge.com',  role: 'SUPER_ADMIN' },
  { name: 'Kavya',        email: 'kavya@rigforge.com',  role: 'ADMIN' },
  { name: 'Pranav',       email: 'pranav@rigforge.com', role: 'EMPLOYEE' },
  { name: 'Abhyam',       email: 'abhyam@rigforge.com', role: 'EMPLOYEE' },
]

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, isActive: true, isOnboarding: false, mustChangePassword: false },
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        isActive: true,
        isOnboarding: false,
        mustChangePassword: false,
      },
    })
    console.log(`  ✓ ${user.email.padEnd(22)} ${user.role.padEnd(12)} id=${user.id}`)
  }
  const count = await prisma.user.count()
  console.log(`\nTotal users in dev DB: ${count}`)
  console.log(`Login password for all accounts: ${PASSWORD}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
