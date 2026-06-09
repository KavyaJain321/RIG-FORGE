/**
 * Generates new temp passwords for all non-SUPER_ADMIN users.
 * Updates DB and prints JSON credentials list.
 * Run: npx tsx scripts/generate-all-credentials.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { encryptSecret } from '../lib/secret-box'

const prisma = new PrismaClient()

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '#$!@%&'
  const all = upper + lower + digits + symbols
  const bytes = crypto.randomBytes(12)
  let p = ''
  p += upper[bytes[0] % upper.length]
  p += lower[bytes[1] % lower.length]
  p += digits[bytes[2] % digits.length]
  p += symbols[bytes[3] % symbols.length]
  for (let i = 4; i < 12; i++) p += all[bytes[i] % all.length]
  return p.split('').sort(() => (crypto.randomBytes(1)[0] ?? 128) / 256 - 0.5).join('')
}

async function main() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true },
  })

  const results: { name: string; email: string; role: string; password: string; mustChange: string }[] = []

  // Super Admin — preset password, no forced change
  results.push({
    name: 'Rohit Gandhi',
    email: 'rohit@rigforge.com',
    role: 'SUPER_ADMIN',
    password: 'RigForge@Rohit#2024',
    mustChange: 'No',
  })

  for (const user of users) {
    if (user.role === 'SUPER_ADMIN') continue

    const pwd = generatePassword()
    const hash = await bcrypt.hash(pwd, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, tempPassword: encryptSecret(pwd), mustChangePassword: true },
    })
    results.push({
      name: user.name,
      email: user.email,
      role: user.role,
      password: pwd,
      mustChange: 'Yes',
    })
  }

  console.log(JSON.stringify(results, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
