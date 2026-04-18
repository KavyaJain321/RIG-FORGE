/**
 * Seed script: Creates the Super Admin account for Rohit Gandhi.
 *
 * Run ONCE after migrating the DB schema:
 *   npx tsx scripts/seed-superadmin.ts
 *
 * ⚠️  Keep the preset password private. It is NEVER stored in temp password
 *     and cannot be seen or reset by anyone else in the system.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── Super Admin credentials ──────────────────────────────────────────────────
const SUPER_ADMIN_NAME = 'Rohit Gandhi'
const SUPER_ADMIN_EMAIL = 'rohit@rigforge.com'
// Change this password AFTER running the seed if you prefer a different one.
// This password is never stored in tempPassword — only the bcrypt hash is kept.
const SUPER_ADMIN_PASSWORD = 'RigForge@Rohit#2024'

async function main() {
  console.log('🔑  Seeding Super Admin account...')

  const existing = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  })

  if (existing) {
    if (existing.role === 'SUPER_ADMIN') {
      console.log('✅  Super Admin already exists — nothing to do.')
    } else {
      // Upgrade existing account to SUPER_ADMIN
      const hash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12)
      await prisma.user.update({
        where: { email: SUPER_ADMIN_EMAIL },
        data: {
          role: 'SUPER_ADMIN',
          passwordHash: hash,
          mustChangePassword: false,
          tempPassword: null,
          isOnboarding: false,
          isActive: true,
        },
      })
      console.log('✅  Existing account upgraded to SUPER_ADMIN.')
    }
    return
  }

  const hash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12)

  await prisma.user.create({
    data: {
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      isOnboarding: false,
      isActive: true,
      currentStatus: 'NOT_WORKING',
      mustChangePassword: false,  // Super Admin password is preset — no forced change
      tempPassword: null,         // Never stored for Super Admin
    },
  })

  console.log(`✅  Super Admin created:`)
  console.log(`    Name:  ${SUPER_ADMIN_NAME}`)
  console.log(`    Email: ${SUPER_ADMIN_EMAIL}`)
  console.log(`    Password: ${SUPER_ADMIN_PASSWORD}`)
  console.log(`\n⚠️  Keep this password private — delete this log from your terminal history.`)
}

main()
  .catch((e) => { console.error('❌  Seed failed:', e); process.exit(1) })
  .finally(() => void prisma.$disconnect())
