/**
 * One-off: create Madhur Aggarwal as EMPLOYEE on the Content Creation project.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const NAME = 'Madhur Aggarwal'
const EMAIL = 'madhur@rigforge.com'
const ROLE = 'EMPLOYEE'

// Generate a temp password (8-12 chars, mix of letters/digits/symbols)
function genTempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!#$%&*@'
  let pw = ''
  for (let i = 0; i < 6; i++) pw += letters[Math.floor(Math.random() * letters.length)]
  for (let i = 0; i < 3; i++) pw += digits[Math.floor(Math.random() * digits.length)]
  pw += symbols[Math.floor(Math.random() * symbols.length)]
  return pw.split('').sort(() => Math.random() - 0.5).join('')
}

// ── 1. Find Content Creation project ──────────────────────────────────────

const project = await prisma.project.findFirst({
  where: {
    isActive: true,
    OR: [
      { name: { equals: 'Content Creation', mode: 'insensitive' } },
      { name: { contains: 'Content Creation', mode: 'insensitive' } },
    ],
  },
  select: { id: true, name: true },
})

if (!project) {
  console.error('Could not find a project named "Content Creation"')
  process.exit(1)
}
console.log(`Found project: ${project.name} (${project.id})`)

// ── 2. Check if Madhur already exists ─────────────────────────────────────

const existing = await prisma.user.findUnique({ where: { email: EMAIL } })
if (existing) {
  console.error(`User with email ${EMAIL} already exists — aborting to avoid overwrite`)
  process.exit(1)
}

// ── 3. Create user ────────────────────────────────────────────────────────

const tempPw = genTempPassword()
const hash = await bcrypt.hash(tempPw, 12)

const user = await prisma.user.create({
  data: {
    name: NAME,
    email: EMAIL,
    passwordHash: hash,
    role: ROLE,
    tempPassword: tempPw,
    mustChangePassword: true,
    isOnboarding: false,
    isActive: true,
    currentStatus: 'NOT_WORKING',
  },
  select: { id: true, name: true, email: true, role: true },
})

console.log(`\nCreated user:`)
console.log(`  ${user.name} (${user.role})`)
console.log(`  id:    ${user.id}`)
console.log(`  email: ${user.email}`)

// ── 4. Add to Content Creation project ────────────────────────────────────

await prisma.projectMember.create({
  data: { userId: user.id, projectId: project.id },
})
console.log(`\nAdded to project: ${project.name}`)

// ── 5. Output the temp credentials ────────────────────────────────────────

console.log(`\n╔════════════════════════════════════════════════╗`)
console.log(`║  CREDENTIALS FOR MADHUR — SHARE PRIVATELY      ║`)
console.log(`╠════════════════════════════════════════════════╣`)
console.log(`║  Email:    ${user.email.padEnd(34)}  ║`)
console.log(`║  Password: ${tempPw.padEnd(34)}  ║`)
console.log(`║                                                ║`)
console.log(`║  He must change the password on first login.   ║`)
console.log(`╚════════════════════════════════════════════════╝`)

await prisma.$disconnect()
