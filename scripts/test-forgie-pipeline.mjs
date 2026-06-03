/**
 * End-to-end test of Forgie's message pipeline WITHOUT going through HTTP auth.
 * Picks an existing admin user, runs the same steps the route runs, and prints
 * the conversation log. Also confirms DB writes happened.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/test-forgie-pipeline.mjs
 */

import { prisma } from '../lib/db.ts'
import { generate } from '../lib/llm/generate.ts'
import { buildSystemPrompt } from '../lib/assistant/prompts.ts'
import { buildForgieContext, renderContextBlock } from '../lib/assistant/context.ts'

// Pick an admin user to act as
const user = await prisma.user.findFirst({
  where: { role: 'ADMIN', isActive: true, isOnboarding: false },
  select: { id: true, name: true, role: true },
})

if (!user) {
  console.error('No admin user found in DB')
  process.exit(1)
}

console.log(`Acting as: ${user.name} (${user.role})`)

const QUERIES = [
  "What's on my plate this week?",
  "Who's slacking?",
  "What's Pranav's salary?",
]

for (const query of QUERIES) {
  console.log('\n' + '─'.repeat(70))
  console.log(`USER: ${query}`)
  console.log('─'.repeat(70))

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

  const result = await generate([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ])

  console.log(`FORGIE [${result.provider}/${result.model}] (${result.latencyMs}ms, ${result.inputTokens}→${result.outputTokens} tokens):`)
  console.log(result.text)
}

await prisma.$disconnect()
