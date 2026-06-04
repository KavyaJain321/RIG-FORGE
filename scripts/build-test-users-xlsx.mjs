/**
 * Build an xlsx of RIG 360 team members (intern + full-time + admins),
 * EXCLUDING the UPES journalism cohort whose only project is News Prism.
 *
 * Output:
 *   rig-team-google-test-users.xlsx
 *     Columns:
 *       Name | Role | RIG email | Personal Gmail (to fill) | Projects
 *
 * The intent: send the team this sheet via WhatsApp/email and ask them
 * to fill in their personal Gmail address. You then paste those addresses
 * into Google Cloud Console → Audience → Test users so they can connect
 * Forgie to their Google account.
 */

import { writeFileSync } from 'fs'
import { prisma } from '../lib/db.ts'

// We auto-import xlsx from the existing dependency tree (it's pulled in via
// the credentials scripts you already had). If not present, install with:
//   pnpm add -D xlsx
import * as XLSX from 'xlsx'

console.log('Fetching team members...')

const allUsers = await prisma.user.findMany({
  where: { isActive: true, isOnboarding: false },
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
    projects: {
      select: { project: { select: { name: true } } },
    },
  },
  orderBy: [{ role: 'asc' }, { name: 'asc' }],
})

// Heuristic to identify UPES journalism interns:
//   - Their ONLY project assignment is "News Prism"
//   - Anyone else (admins, multi-project members, or interns on other
//     projects) is part of "the RIG team"
function isUpesJournalismIntern(u) {
  if (u.projects.length === 0) return false  // no projects → not an intern at all
  const names = u.projects.map((p) => p.project.name.toLowerCase())
  return names.length === 1 && names[0] === 'news prism'
}

const ourTeam = allUsers.filter((u) => !isUpesJournalismIntern(u))
const upesInterns = allUsers.filter(isUpesJournalismIntern)

console.log(`\nTotal active users: ${allUsers.length}`)
console.log(`  RIG team (included in xlsx): ${ourTeam.length}`)
console.log(`  UPES journalism interns (excluded): ${upesInterns.length}`)

// Build the xlsx
const rows = ourTeam.map((u) => ({
  Name: u.name,
  Role: u.role.replace('_', ' '),
  'RIG email': u.email,
  'Personal Gmail (fill in)': '',
  'Projects': u.projects.map((p) => p.project.name).sort().join(', ') || '(none)',
}))

const wb = XLSX.utils.book_new()
const ws = XLSX.utils.json_to_sheet(rows)

// Set column widths so it actually looks readable
ws['!cols'] = [
  { wch: 22 },  // Name
  { wch: 14 },  // Role
  { wch: 28 },  // RIG email
  { wch: 30 },  // Personal Gmail
  { wch: 60 },  // Projects
]

XLSX.utils.book_append_sheet(wb, ws, 'RIG team')

// Use timestamp suffix so re-running doesn't collide with an already-open
// copy in Excel (which holds an exclusive write lock on Windows).
const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
const outPath = `rig-team-google-test-users-${stamp}.xlsx`
XLSX.writeFile(wb, outPath)

console.log(`\n✓ Wrote ${outPath}`)
console.log(`\nRows included:`)
for (const r of rows) {
  console.log(`  - ${r.Name.padEnd(20)} (${r.Role.padEnd(12)}) — ${r.Projects.slice(0, 60)}`)
}
console.log(`\nExcluded (UPES News Prism only):`)
for (const u of upesInterns) {
  console.log(`  - ${u.name}`)
}

await prisma.$disconnect()
