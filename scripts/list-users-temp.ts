import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, isOnboarding: true, tempPassword: true, mustChangePassword: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }]
  })
  console.log(JSON.stringify(users, null, 2))
}
main().catch(console.error).finally(() => prisma.$disconnect())
