import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('Admin1234!', 12)
  await prisma.user.upsert({
    where: { email: 'admin@forge.dev' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@forge.dev',
      passwordHash: hash,
      role: 'ADMIN',
    },
  })
  console.log('Seeded: admin@forge.dev / Admin1234!')
}

main().then(() => prisma.$disconnect())
