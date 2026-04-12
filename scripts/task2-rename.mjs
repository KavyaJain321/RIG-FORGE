import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@5.16.1_prisma@5.16.1/node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

const RENAMES = [
  ['OSINT',                     'Open Source Intelligence (OSINT)'],
  ['CC',                        'Conflict Coverage (CC)'],
  ['Corruptx',                  'Corruptx'],
  ['Childsafe',                 'Child Safety Intelligence (Childsafe)'],
  ['Drone Mapping',             'Drone Mapping'],
  ['Kashmir',                   'Kashmir'],
  ['Vanishing Voices',          'Vanishing Voices'],
  ['TCH',                       'The Corbett House (TCH)'],
  ['Imagery',                   'Imagery'],
  ['DNL',                       'Daily News Letter (DNL)'],
  ['Repositories',              'Repositories'],
  ['Belavida',                  'Belavida'],
  ['Windlass',                  'Windlass'],
  ['Social Media Posting',      'Social Media Posting'],
  ['Stance',                    'Stance'],
  ['Video Editing & Integration','Video Editing & Integration'],
  ['News Prism',                'News Prism'],
]

async function main() {
  console.log('\n═══════════════════════════════════════')
  console.log('TASK 2 — RENAME PROJECTS TO FULL FORMS')
  console.log('═══════════════════════════════════════\n')

  let updated = 0
  let skipped = 0

  for (const [oldName, newName] of RENAMES) {
    const project = await prisma.project.findFirst({
      where: { name: { equals: oldName, mode: 'insensitive' }, isActive: true },
    })

    if (!project) {
      console.log(`  NOT FOUND (skip): "${oldName}"`)
      skipped++
      continue
    }

    if (project.name === newName) {
      console.log(`  UNCHANGED: "${project.name}"`)
      skipped++
      continue
    }

    await prisma.project.update({ where: { id: project.id }, data: { name: newName } })
    console.log(`  Renamed: "${project.name}" → "${newName}"`)
    updated++
  }

  console.log(`\nRenamed: ${updated} | Unchanged/not-found: ${skipped}`)
  console.log('\n✅ DONE — TASK 2 COMPLETE')
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
