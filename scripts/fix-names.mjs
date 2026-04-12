import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@5.16.1_prisma@5.16.1/node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

const FIXES = [
  // [currentName, correctedName, clearDescription]
  ['Conflict Coverage (CC)',              'Content Creation (CC)',          true],   // CC = Content Creation, not Conflict Coverage
  ['Child Safety Intelligence (Childsafe)', 'Child Safe Environment (Childsafe)', false], // description still relevant
  ['Daily News Letter (DNL)',             'Democracy News Live (DNL)',      false],  // description still relevant
]

async function main() {
  console.log('\n═══════════════════════════════════════')
  console.log('FIX — PROJECT NAME CORRECTIONS')
  console.log('═══════════════════════════════════════\n')

  for (const [currentName, newName, clearDesc] of FIXES) {
    const project = await prisma.project.findFirst({
      where: { name: { equals: currentName, mode: 'insensitive' }, isActive: true },
    })

    if (!project) {
      console.log(`  ❌ NOT FOUND: "${currentName}"`)
      continue
    }

    const updateData = { name: newName }
    if (clearDesc) updateData.description = null  // description was based on wrong interpretation

    await prisma.project.update({ where: { id: project.id }, data: updateData })

    console.log(`  ✅ Renamed: "${currentName}"`)
    console.log(`         → "${newName}"`)
    if (clearDesc) console.log(`         ↳ Description cleared (was based on wrong name interpretation)`)
  }

  console.log('\n── Projects WITHOUT descriptions (after fixes) ──\n')
  const allActive = await prisma.project.findMany({
    where: { isActive: true },
    select: { name: true, description: true },
    orderBy: { name: 'asc' },
  })

  const noDesc = allActive.filter((p) => !p.description || p.description.trim() === '')
  noDesc.forEach((p) => console.log(`  ◌  ${p.name}`))
  console.log(`\n  Total without descriptions: ${noDesc.length}`)
  console.log(`  Total active projects: ${allActive.length}`)
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
