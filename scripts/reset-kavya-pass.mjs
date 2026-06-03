/**
 * Reset Kavya's password to a known value for local testing.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/reset-kavya-pass.mjs
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Find any user named Kavya (case-insensitive, partial)
const kavya = await prisma.user.findFirst({
  where: {
    name: { contains: 'Kavya', mode: 'insensitive' },
    isActive: true,
  },
  select: { id: true, name: true, email: true, role: true, isOnboarding: true, mustChangePassword: true },
})

if (!kavya) {
  console.error('Could not find user with name containing "Kavya"')
  process.exit(1)
}

const NEW_PASSWORD = 'Forgie@Test1'

const hash = await bcrypt.hash(NEW_PASSWORD, 12)
await prisma.user.update({
  where: { id: kavya.id },
  data: {
    passwordHash: hash,
    mustChangePassword: false,  // skip the forced-change flow for testing
    tempPassword: null,
    isOnboarding: false,
  },
})

console.log('\n✓ Password reset complete.\n')
console.log('  Name:    ', kavya.name)
console.log('  Email:   ', kavya.email)
console.log('  Role:    ', kavya.role)
console.log('  Password:', NEW_PASSWORD)
console.log('\nLog in at http://localhost:3000/login\n')

await prisma.$disconnect()
