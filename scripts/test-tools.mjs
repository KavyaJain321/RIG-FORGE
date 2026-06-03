/**
 * Test tool calling: ask questions that require Forgie to reach
 * beyond the pre-loaded context.
 */

import { prisma } from '../lib/db.ts'
import { generate } from '../lib/llm/generate.ts'
import { buildSystemPrompt } from '../lib/assistant/prompts.ts'
import { buildForgieContext, renderContextBlock } from '../lib/assistant/context.ts'
import { buildReadTools, TOOL_USE_GUIDANCE } from '../lib/assistant/ai-sdk-tools.ts'

const user = await prisma.user.findFirst({
  where: { role: 'ADMIN', isActive: true, isOnboarding: false },
  select: { id: true, name: true, role: true },
})
if (!user) { console.error('no admin'); process.exit(1) }

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
  '',
  TOOL_USE_GUIDANCE,
].join('\n')

const tools = buildReadTools({ userId: user.id, role: user.role })

const QUERIES = [
  "Tell me about Abhyam — what are they working on?",
  "How is the Childsafe project doing? Give me the health score.",
  "Find any tickets that are stale (open more than 24 hours).",
  "Who on the team is currently working?",
]

for (const q of QUERIES) {
  console.log('\n' + '═'.repeat(70))
  console.log(`USER: ${q}`)
  console.log('─'.repeat(70))

  const result = await generate(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: q },
    ],
    { tools },
  )

  console.log(`FORGIE [${result.provider}/${result.model}] (${result.latencyMs}ms):`)
  console.log(result.text)
  if (result.toolCalls.length > 0) {
    console.log(`\n  Tools called: ${result.toolCalls.map((c) => c.name).join(', ')}`)
  } else {
    console.log(`\n  (no tools — answered from context)`)
  }
}

await prisma.$disconnect()
