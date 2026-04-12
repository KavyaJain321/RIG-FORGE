import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@5.16.1_prisma@5.16.1/node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

function check(num, label, pass, detail = '') {
  const icon = pass ? '✅' : '❌'
  console.log(`${icon} ${num}. ${label}`)
  if (!pass && detail) console.log(`       ↳ ${detail}`)
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════')
  console.log('FINAL VERIFICATION')
  console.log('═══════════════════════════════════════════════════\n')

  const projects = await prisma.project.findMany({
    include: {
      members: { include: { user: { select: { email: true, name: true } } } },
    },
  })
  const activeProjects = projects.filter((p) => p.isActive)

  // Helper: find active project by exact name
  function proj(name) { return activeProjects.find((p) => p.name === name) }
  function hasMember(projectName, email) {
    const p = proj(projectName)
    return p?.members.some((m) => m.user.email === email) ?? false
  }

  // 1. Only one active project contains "Video Editing" named exactly "Video Editing & Integration"
  const vei = activeProjects.filter((p) => p.name.toLowerCase().includes('video editing'))
  check(1, 'Only one active project with "Video Editing" — named "Video Editing & Integration"',
    vei.length === 1 && vei[0].name === 'Video Editing & Integration',
    `Found: ${vei.map((p) => p.name).join(', ') || 'none'}`)

  // 2. No active project named "Video Editing" or "Integration" standalone
  const badVE = activeProjects.find((p) => p.name.toLowerCase() === 'video editing')
  const badInteg = activeProjects.find((p) => p.name.toLowerCase() === 'integration')
  check(2, 'No active project named "Video Editing" or "Integration" (standalone)',
    !badVE && !badInteg,
    `Found standalone: ${[badVE?.name, badInteg?.name].filter(Boolean).join(', ')}`)

  // 3. OSINT renamed
  check(3, '"OSINT" renamed → "Open Source Intelligence (OSINT)"',
    !!proj('Open Source Intelligence (OSINT)'),
    'Project not found by new name')

  // 4. CC renamed
  check(4, '"CC" renamed → "Conflict Coverage (CC)"',
    !!proj('Conflict Coverage (CC)'),
    'Project not found by new name')

  // 5. TCH renamed
  check(5, '"TCH" renamed → "The Corbett House (TCH)"',
    !!proj('The Corbett House (TCH)'),
    'Project not found by new name')

  // 6. DNL renamed
  check(6, '"DNL" renamed → "Daily News Letter (DNL)"',
    !!proj('Daily News Letter (DNL)'),
    'Project not found by new name')

  // 7. Childsafe renamed
  check(7, '"Childsafe" renamed → "Child Safety Intelligence (Childsafe)"',
    !!proj('Child Safety Intelligence (Childsafe)'),
    'Project not found by new name')

  // 8. Kavya = ADMIN
  const kavya = await prisma.user.findUnique({ where: { email: 'kavya@rigforge.com' } })
  check(8, "Kavya's role = ADMIN",
    kavya?.role === 'ADMIN',
    `Actual role: ${kavya?.role ?? 'NOT FOUND'}`)

  // 9. 13 projects with non-null non-empty descriptions
  const withDesc = activeProjects.filter((p) => p.description && p.description.trim() !== '')
  check(9, '13 active projects have non-null, non-empty description',
    withDesc.length === 13,
    `Found ${withDesc.length} with descriptions: ${withDesc.map((p) => p.name).join(', ')}`)

  // 10. These 4 projects have null/empty description
  const noDescProjects = ['Social Media Posting', 'Stance', 'Video Editing & Integration', 'News Prism']
  const allNull = noDescProjects.every((name) => {
    const p = proj(name)
    return !p?.description || p.description.trim() === ''
  })
  const badlySet = noDescProjects.filter((name) => {
    const p = proj(name)
    return p?.description && p.description.trim() !== ''
  })
  check(10, 'Social Media Posting, Stance, Video Editing & Integration, News Prism have null description',
    allNull,
    `These have non-null descriptions: ${badlySet.join(', ')}`)

  // 11. Abhyam in Corruptx and Child Safety Intelligence
  const abhyamCorruptx = hasMember('Corruptx', 'abhyam@rigforge.com')
  const abhyamChild = hasMember('Child Safety Intelligence (Childsafe)', 'abhyam@rigforge.com')
  check(11, 'Abhyam is member of Corruptx and Child Safety Intelligence (Childsafe)',
    abhyamCorruptx && abhyamChild,
    `Corruptx: ${abhyamCorruptx}, Childsafe: ${abhyamChild}`)

  // 12. Ahmed in TCH and Child Safety Intelligence
  const ahmedTCH = hasMember('The Corbett House (TCH)', 'ahmed@rigforge.com')
  const ahmedChild = hasMember('Child Safety Intelligence (Childsafe)', 'ahmed@rigforge.com')
  check(12, 'Ahmed is member of The Corbett House (TCH) and Child Safety Intelligence (Childsafe)',
    ahmedTCH && ahmedChild,
    `TCH: ${ahmedTCH}, Childsafe: ${ahmedChild}`)

  // 13. Rohun in Social Media Posting
  const rohunSMP = hasMember('Social Media Posting', 'rohun@rigforge.com')
  check(13, 'Rohun is member of Social Media Posting',
    rohunSMP,
    'Membership not found')

  // 14. Pranavv in OSINT, Drone Mapping, News Prism
  const pranavvOSINT = hasMember('Open Source Intelligence (OSINT)', 'pranavv@rigforge.com')
  const pranavvDrone = hasMember('Drone Mapping', 'pranavv@rigforge.com')
  const pranavvNews = hasMember('News Prism', 'pranavv@rigforge.com')
  check(14, 'Pranavv is member of Open Source Intelligence (OSINT), Drone Mapping, and News Prism',
    pranavvOSINT && pranavvDrone && pranavvNews,
    `OSINT: ${pranavvOSINT}, Drone Mapping: ${pranavvDrone}, News Prism: ${pranavvNews}`)

  // 15. Total active projects = 17
  check(15, 'Total active projects = 17',
    activeProjects.length === 17,
    `Actual count: ${activeProjects.length} — [${activeProjects.map((p) => p.name).join(', ')}]`)

  const failures = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].filter((n) => {
    // Re-evaluate each check's pass/fail inline isn't straightforward here,
    // so we'll just print the summary
    return false
  })

  console.log('\n═══════════════════════════════════════════════════')
  console.log('Verification complete. Fix any ❌ items above before proceeding.')
  console.log('═══════════════════════════════════════════════════\n')
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
