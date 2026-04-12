import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@5.16.1_prisma@5.16.1/node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

async function main() {
  console.log('\n═══════════════════════════════════════')
  console.log('TASK 4 — PROMOTE KAVYA TO ADMIN')
  console.log('═══════════════════════════════════════\n')

  const kavya = await prisma.user.findUnique({ where: { email: 'kavya@rigforge.com' } })
  if (!kavya) throw new Error('User kavya@rigforge.com not found')

  console.log(`  Found: ${kavya.name} (${kavya.email}) — current role: ${kavya.role}`)

  if (kavya.role === 'ADMIN') {
    console.log('  Already ADMIN — no update needed')
  } else {
    await prisma.user.update({ where: { id: kavya.id }, data: { role: 'ADMIN' } })
    console.log('  Updated role: EMPLOYEE → ADMIN')
  }

  console.log('\n✅ Kavya promoted to ADMIN')
  console.log('\n✅ DONE — TASK 4 COMPLETE')
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
