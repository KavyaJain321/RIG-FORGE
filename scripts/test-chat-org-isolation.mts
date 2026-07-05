/**
 * Cross-org isolation test for the native-chat data layer (multi-tenancy fix).
 *
 * Drives the REAL lib/chat/service.ts functions under two org contexts in the
 * SAME schema — the origin org ('rig360') and a throwaway 'ghost-iso-test' —
 * exactly the way the app's rig360-vs-ghost-org isolation proof does. Verifies:
 *   1. Top-level Conversation writes are stamped with the CALLER's org.
 *   2. NESTED member + seeded-message writes are stamped with the caller's org
 *      (the DB-default trap: the column default is 'rig360', so nested inserts
 *      that don't pass org explicitly would silently land in rig360).
 *   3. ChatMessage writes (sendMessage / forgie welcome) are stamped correctly.
 *   4. Enumeration is isolated: rig360 listConversations never returns ghost
 *      conversations, and the ghost org's member rows are scoped out of rig360.
 *
 * Run from the project root:  npx tsx scripts/test-chat-org-isolation.mts
 * Writes throwaway rows under organizationId='ghost-iso-test' and deletes them.
 */
import fs from 'node:fs'

// ── Load .env.local into process.env (tsx doesn't auto-load it) ───────────────
for (const file of ['.env.local', '.env']) {
  try {
    const txt = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
    }
  } catch { /* file optional */ }
}

const GHOST = 'ghost-iso-test'
const RIG = 'rig360'
let failures = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra ? `  (${extra})` : ''}`)
  if (!cond) failures++
}

// Dynamic-import AFTER env is set so PrismaClient picks up DATABASE_URL.
const { prisma } = await import('@/lib/db')
const { runWithOrg } = await import('@/lib/tenant-context')
const svc = await import('@/lib/chat/service')

async function cleanupGhost() {
  // Match on the literal value so we delete regardless of ambient org scope.
  await prisma.chatMessage.deleteMany({ where: { organizationId: GHOST } })
  await prisma.conversationMember.deleteMany({ where: { organizationId: GHOST } })
  await prisma.conversation.deleteMany({ where: { organizationId: GHOST } })
}

async function main() {
  // Two real users (FKs require existing User rows; org column is irrelevant to the FK).
  const users = await prisma.user.findMany({ where: { isActive: true }, take: 2, select: { id: true, name: true } })
  if (users.length < 2) throw new Error('need >= 2 active users in the default schema — run seed-dev-users.mjs')
  const [a, b] = users
  console.log(`Using users: ${a.name} (${a.id}), ${b.name} (${b.id})\n`)

  console.log('0) Clean any leftover ghost rows...')
  await cleanupGhost()

  console.log(`\n1) Writes under runWithOrg('${GHOST}') — must stamp '${GHOST}', not the DB default '${RIG}':`)
  const { dm, msg, forgie } = await runWithOrg(GHOST, async () => {
    const dm = await svc.getOrCreateDm(a.id, b.id)
    const msg = await svc.sendMessage(dm.id, a.id, 'ghost isolation probe')
    const forgie = await svc.getOrCreateForgieChat(a.id)
    return { dm, msg, forgie }
  })
  check("DM conversation stamped", dm.organizationId === GHOST, `organizationId=${dm.organizationId}`)
  check("sendMessage ChatMessage stamped", msg.organizationId === GHOST, `organizationId=${msg.organizationId}`)
  check("Forgie conversation stamped", forgie.organizationId === GHOST, `organizationId=${forgie.organizationId}`)

  // NESTED writes — read them back with an explicit organizationId=GHOST filter.
  // If a nested row had wrongly fallen to the DB default ('rig360'), it would NOT
  // match here and the count would come up short — catching exactly the bug.
  const dmMembers = await prisma.conversationMember.findMany({ where: { conversationId: dm.id, organizationId: GHOST } })
  check("DM nested members stamped (2)", dmMembers.length === 2 && dmMembers.every((m) => m.organizationId === GHOST),
    `count=${dmMembers.length}, orgs=${[...new Set(dmMembers.map((m) => m.organizationId))].join(',')}`)
  const forgieMembers = await prisma.conversationMember.findMany({ where: { conversationId: forgie.id, organizationId: GHOST } })
  check("Forgie nested member stamped", forgieMembers.length === 1 && forgieMembers[0].organizationId === GHOST,
    `org=${forgieMembers[0]?.organizationId}`)
  const forgieMsgs = await prisma.chatMessage.findMany({ where: { conversationId: forgie.id, organizationId: GHOST } })
  check("Forgie seeded welcome message stamped", forgieMsgs.length >= 1 && forgieMsgs.every((m) => m.organizationId === GHOST),
    `count=${forgieMsgs.length}, orgs=${[...new Set(forgieMsgs.map((m) => m.organizationId))].join(',')}`)

  console.log(`\n2) Enumeration isolation — '${RIG}' context must NOT see the ghost conversations:`)
  const rigList = await runWithOrg(RIG, () => svc.listConversations(a.id))
  const rigIds = new Set(rigList.map((c) => c.id))
  check("rig360 listConversations excludes ghost DM", !rigIds.has(dm.id))
  check("rig360 listConversations excludes ghost Forgie", !rigIds.has(forgie.id))

  const ghostList = await runWithOrg(GHOST, () => svc.listConversations(a.id))
  const ghostIds = new Set(ghostList.map((c) => c.id))
  check("ghost listConversations includes its own DM", ghostIds.has(dm.id))

  // Member-level scoping: the ghost DM's members are invisible from the rig360 scope.
  const visibleFromRig = await runWithOrg(RIG, () =>
    prisma.conversationMember.findMany({ where: { conversationId: dm.id } }))
  check("rig360-scoped query cannot see ghost DM members", visibleFromRig.length === 0, `saw ${visibleFromRig.length}`)

  console.log('\n3) Cleanup ghost rows...')
  await cleanupGhost()
  const left = await prisma.conversation.count({ where: { organizationId: GHOST } })
  check("ghost rows removed", left === 0, `remaining=${left}`)

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED — chat is org-isolated' : `❌ ${failures} CHECK(S) FAILED`}`)
  if (failures) process.exitCode = 1
}

main()
  .catch(async (e) => { console.error('❌ test error:', e); await cleanupGhost().catch(() => {}); process.exit(1) })
  .finally(() => prisma.$disconnect())
