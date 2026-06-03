/**
 * Reset Daksh's password to a known temp value for handoff.
 * He'll be forced to change it on first login.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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

const daksh = await prisma.user.findFirst({
  where: { name: { contains: 'Daksh', mode: 'insensitive' }, isActive: true },
  select: { id: true, name: true, email: true, role: true },
})

if (!daksh) {
  console.error('Could not find user "Daksh"')
  process.exit(1)
}

const tempPw = genTempPassword()
const hash = await bcrypt.hash(tempPw, 12)

await prisma.user.update({
  where: { id: daksh.id },
  data: {
    passwordHash: hash,
    tempPassword: tempPw,
    mustChangePassword: true,
  },
})

console.log(`\n╔════════════════════════════════════════════════╗`)
console.log(`║  CREDENTIALS FOR ${daksh.name.padEnd(30)} ║`)
console.log(`╠════════════════════════════════════════════════╣`)
console.log(`║  Email:    ${daksh.email.padEnd(34)}  ║`)
console.log(`║  Password: ${tempPw.padEnd(34)}  ║`)
console.log(`║  Role:     ${daksh.role.padEnd(34)}  ║`)
console.log(`║                                                ║`)
console.log(`║  He must change the password on first login.   ║`)
console.log(`╚════════════════════════════════════════════════╝`)

await prisma.$disconnect()
