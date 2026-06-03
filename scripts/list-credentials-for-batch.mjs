import { PrismaClient } from '../node_modules/@prisma/client/index.js'
const p = new PrismaClient()

const emails = [
  'ahmed@rigforge.com','kavya@rigforge.com','pranavv@rigforge.com','rhadesh@rigforge.com',
  'sumit@rigforge.com','utkarsh@rigforge.com','yash@rigforge.com',
  'chinmay@rigforge.com','jaskeerat@rigforge.com','ashmita@rigforge.com',
  'pragati@rigforge.com','shakshi@rigforge.com','minakshi@rigforge.com',
  'tanisha@rigforge.com','armaan@rigforge.com','aashray@rigforge.com',
  'anamika@rigforge.com','karnika@rigforge.com','aditi@rigforge.com',
  'rittana@rigforge.com',
]

const users = await p.user.findMany({
  where: { email: { in: emails } },
  select: { name: true, email: true, role: true, mustChangePassword: true, tempPassword: true, isActive: true },
  orderBy: { name: 'asc' },
})
console.log(JSON.stringify(users, null, 2))
console.log(`\nfound ${users.length} of ${emails.length} requested`)
const found = new Set(users.map(u => u.email))
const missing = emails.filter(e => !found.has(e))
if (missing.length) console.log('MISSING:', missing)

await p.$disconnect()
