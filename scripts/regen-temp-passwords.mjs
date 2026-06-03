import { PrismaClient } from '../node_modules/@prisma/client/index.js'
import bcrypt from '../node_modules/bcryptjs/index.js'
import crypto from 'node:crypto'

const prisma = new PrismaClient()

// 12-char password matching existing pattern: letters + digits + 1-2 symbols
function generateTempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%&'
  const alphabet = letters + digits
  const bytes = crypto.randomBytes(64)
  let out = ''
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length]
  // Inject 2 symbols at random positions
  const pos1 = bytes[10] % 10
  const pos2 = bytes[11] % 10
  out = out.slice(0, pos1) + symbols[bytes[12] % symbols.length] + out.slice(pos1)
  out = out.slice(0, pos2) + symbols[bytes[13] % symbols.length] + out.slice(pos2)
  return out
}

const emails = [
  'pranavv@rigforge.com',
  'abhyam@rigforge.com',
  'rhadesh@rigforge.com',
]

const results = []
for (const email of emails) {
  const temp = generateTempPassword()
  const hash = await bcrypt.hash(temp, 12)
  await prisma.user.update({
    where: { email },
    data: {
      passwordHash: hash,
      tempPassword: temp,
      mustChangePassword: true,
      isOnboarding: false,
      isActive: true,
    },
  })
  results.push({ email, tempPassword: temp })
}

console.log(JSON.stringify(results, null, 2))
await prisma.$disconnect()
