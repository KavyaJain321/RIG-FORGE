/**
 * Smoke test for the LLM provider abstraction.
 * Sends a tiny prompt through generate() and prints what came back.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/test-llm.mjs
 */

import { generate } from '../lib/llm/generate.ts'

const result = await generate([
  { role: 'system', content: 'You are a test. Respond with exactly one word: "OK".' },
  { role: 'user', content: 'Ping.' },
])

console.log('--- Forgie LLM smoke test ---')
console.log('Provider:', result.provider)
console.log('Model:   ', result.model)
console.log('Tokens:  ', result.inputTokens, 'in /', result.outputTokens, 'out')
console.log('Latency: ', result.latencyMs, 'ms')
console.log('Fallback:', result.fallback)
console.log('Text:    ', result.text)
