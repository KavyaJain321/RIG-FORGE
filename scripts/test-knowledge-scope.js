/**
 * One-off verification for the KNOWLEDGE_SCOPE prompt fix.
 *
 * Picks an admin user (preferring one with Google connected), mints a
 * session JWT with the app's own secret, and asks Forgie a capability
 * question through POST /api/assistant/message. Before the fix the
 * system prompt said "you don't have email/calendar/GitHub/WhatsApp" —
 * so a correct run should now AFFIRM these capabilities, not deny them.
 *
 * Usage: node --env-file=.env scripts/test-knowledge-scope.js ["custom question"]
 */
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  // Default: an admin with Google connected so gcal/gmail/drive tools attach.
  // TEST_USER=employee-noglue: an EMPLOYEE with no Google integration, to
  // check the model doesn't overclaim tools it doesn't have.
  const googleUserIds = (await prisma.googleIntegration.findMany({
    select: { userId: true },
  })).map((g) => g.userId)

  const user = process.env.TEST_USER === 'employee-noglue'
    ? await prisma.user.findFirst({
        where: { isActive: true, role: 'EMPLOYEE', id: { notIn: googleUserIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : await prisma.user.findFirst({
        where: {
          isActive: true,
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          ...(googleUserIds.length > 0 ? { id: { in: googleUserIds } } : {}),
        },
        select: { id: true, name: true, email: true, role: true },
      })
  if (!user) throw new Error('No matching user found')
  console.log(`Acting as: ${user.name} <${user.email}> (${user.role})`)
  console.log(`Google connected for this user: ${googleUserIds.includes(user.id)}`)

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      isOnboarding: false,
      mustChangePassword: false,
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' },
  )

  const question =
    process.argv[2] ??
    'quick capability check — are you able to send emails, set up calendar meetings, look at our GitHub repos, and send WhatsApp messages? just tell me yes/no for each and how it works'

  console.log(`\nAsking: ${question}\n---`)
  const res = await fetch('http://localhost:3000/api/assistant/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `forge-token=${token}`,
    },
    body: JSON.stringify({ content: question }),
  })
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let done = null
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const frame = JSON.parse(line)
      if (frame.type === 'text') text += frame.delta
      if (frame.type === 'done') done = frame
      if (frame.type === 'error') console.error('ERROR frame:', frame)
    }
  }

  console.log(text)
  console.log('---')
  if (done) {
    console.log(`provider=${done.provider} model=${done.model} cached=${done.cached ?? false}`)
    console.log(`toolsUsed=${JSON.stringify(done.toolsUsed)}`)
    console.log(`pendingActions=${JSON.stringify((done.pendingActions ?? []).map((a) => a.label))}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
