import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@5.16.1_prisma@5.16.1/node_modules/@prisma/client/index.js'

const prisma = new PrismaClient()

// project full name → array of emails
const MEMBERSHIPS = {
  'Open Source Intelligence (OSINT)':      ['pranavv@rigforge.com', 'kavya@rigforge.com'],
  'Conflict Coverage (CC)':                ['kavya@rigforge.com', 'rhadesh@rigforge.com', 'pankaj@rigforge.com'],
  'Corruptx':                              ['abhyam@rigforge.com'],
  'Child Safety Intelligence (Childsafe)': ['abhyam@rigforge.com', 'daksh@rigforge.com', 'ahmed@rigforge.com'],
  'Drone Mapping':                         ['pranavv@rigforge.com', 'rhadesh@rigforge.com', 'sumit@rigforge.com', 'kavya@rigforge.com', 'yash@rigforge.com', 'sudipta@rigforge.com', 'shubham@rigforge.com', 'pankaj@rigforge.com', 'utkarsh@rigforge.com'],
  'Vanishing Voices':                      ['kashvi@rigforge.com', 'pankaj@rigforge.com'],
  'The Corbett House (TCH)':               ['ahmed@rigforge.com'],
  'Imagery':                               ['shubham@rigforge.com'],
  'Daily News Letter (DNL)':               ['kashvi@rigforge.com', 'sudipta@rigforge.com', 'krishn@rigforge.com'],
  'Repositories':                          ['utkarsh@rigforge.com'],
  'Social Media Posting':                  ['rohun@rigforge.com'],
  'News Prism':                            ['pranavv@rigforge.com'],
}

async function main() {
  console.log('\n═══════════════════════════════════════')
  console.log('TASK 3 — SYNC PROJECT MEMBERSHIPS')
  console.log('═══════════════════════════════════════\n')

  // Pre-load all users by email
  const allUsers = await prisma.user.findMany({ select: { id: true, name: true, email: true } })
  const userByEmail = Object.fromEntries(allUsers.map((u) => [u.email.toLowerCase(), u]))

  // Pre-load all projects by name
  const allProjects = await prisma.project.findMany({
    where: { isActive: true },
    select: { id: true, name: true, members: { select: { userId: true } } },
  })
  const projectByName = Object.fromEntries(allProjects.map((p) => [p.name, p]))

  let added = 0
  let skipped = 0

  for (const [projectName, emails] of Object.entries(MEMBERSHIPS)) {
    const project = projectByName[projectName]
    if (!project) {
      console.log(`  ❌ Project not found: "${projectName}"`)
      continue
    }
    const existingUserIds = new Set(project.members.map((m) => m.userId))

    for (const email of emails) {
      const user = userByEmail[email.toLowerCase()]
      if (!user) {
        console.log(`  ⚠️  User not found: ${email}`)
        continue
      }
      if (existingUserIds.has(user.id)) {
        skipped++
        continue
      }
      await prisma.projectMember.create({
        data: { userId: user.id, projectId: project.id },
      })
      console.log(`  Added: ${user.name} → ${projectName}`)
      added++
    }
  }

  console.log(`\nAdded: ${added} memberships | Already existed: ${skipped}`)
  console.log('\n✅ DONE — TASK 3 COMPLETE')
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
