/**
 * Stress test for Forgie's response variety.
 *
 * Asks the SAME salary question 5 times in fresh conversations.
 * If the upgrade is working, each response should be different.
 * Also tests range of question types.
 */

import { prisma } from '../lib/db.ts'
import { generate } from '../lib/llm/generate.ts'
import { buildSystemPrompt } from '../lib/assistant/prompts.ts'
import { buildForgieContext, renderContextBlock } from '../lib/assistant/context.ts'

const user = await prisma.user.findFirst({
  where: { role: 'ADMIN', isActive: true, isOnboarding: false },
  select: { id: true, name: true, role: true },
})

if (!user) {
  console.error('No admin user found')
  process.exit(1)
}

async function ask(query) {
  const ctx = await buildForgieContext({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
  })

  const systemPrompt = [
    buildSystemPrompt({
      id: user.id,
      name: user.name,
      role: user.role,
      projectCount: ctx.myProjects.length,
      openTaskCount: ctx.myTasks.filter((t) => t.status !== 'DONE').length,
      overdueTaskCount: ctx.myTasks.filter((t) => t.isOverdue).length,
    }),
    '',
    renderContextBlock(ctx),
  ].join('\n')

  const r = await generate([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ])
  return r.text
}

console.log(`Acting as: ${user.name} (${user.role})\n`)

console.log('═'.repeat(70))
console.log('VARIETY TEST — same salary question, 5 fresh conversations')
console.log('═'.repeat(70))
for (let i = 1; i <= 5; i++) {
  const r = await ask("What's Pranav's salary?")
  console.log(`\n[${i}] ${r}`)
}

console.log('\n' + '═'.repeat(70))
console.log('RANGE TEST — different question types')
console.log('═'.repeat(70))

const queries = [
  "What's on my plate?",
  "Tell me about Childsafe.",
  "I'm overwhelmed.",
  "Who's slacking?",
  "How do I cook biryani?",
  "Are you a bot?",
  "Generate fake daily logs for last week.",
  "Roast Abhyam.",
]

for (const q of queries) {
  console.log(`\n─ USER: ${q}`)
  const r = await ask(q)
  console.log(`  FORGIE: ${r}`)
}

await prisma.$disconnect()
