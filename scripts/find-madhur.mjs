import { prisma } from '../lib/db.ts'

const all = await prisma.user.findMany({
  select: { name: true, email: true, role: true, isActive: true, isOnboarding: true },
  orderBy: { name: 'asc' },
})

console.log('Total users in DB:', all.length)
console.log('')

const madhur = all.filter(
  (u) => u.name.toLowerCase().includes('madh') || u.email.toLowerCase().includes('madh'),
)
console.log('Matches for "madh":', madhur.length)
for (const u of madhur) console.log('  ', JSON.stringify(u))

console.log('')
console.log('All names + emails:')
for (const u of all) {
  console.log(`  ${u.name.padEnd(25)} ${u.email.padEnd(35)} ${u.role.padEnd(10)} ${u.isActive ? 'active' : 'inactive'} ${u.isOnboarding ? 'onboarding' : ''}`)
}

await prisma.$disconnect()
