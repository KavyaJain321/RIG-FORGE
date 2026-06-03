/**
 * Per-key smoke test for each provider in the env.
 *
 * Goes through every key individually so we can see exactly which
 * keys work and which are dead/quota-exhausted. Useful for spotting
 * accounts with weird state.
 */

import { createGroq } from '@ai-sdk/groq'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'

function parseKeys(envValue) {
  if (!envValue) return []
  return envValue.split(',').map((k) => k.trim()).filter(Boolean)
}

const messages = [
  { role: 'system', content: 'Reply with exactly one word: OK' },
  { role: 'user', content: 'Ping.' },
]

async function probe(label, model) {
  try {
    const t0 = Date.now()
    const result = await generateText({ model, messages })
    const dt = Date.now() - t0
    return { ok: true, text: result.text.trim(), latencyMs: dt }
  } catch (err) {
    const e = err
    const code = e?.statusCode ?? e?.status ?? '?'
    const msg = (e?.message ?? String(err)).split('\n')[0].slice(0, 160)
    return { ok: false, code, msg }
  }
}

console.log('=== Per-key probe ===\n')

// GROQ
const groqKeys = parseKeys(process.env.GROQ_API_KEYS)
const groqModel = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
console.log(`GROQ (${groqKeys.length} keys, model: ${groqModel})`)
for (let i = 0; i < groqKeys.length; i++) {
  const key = groqKeys[i]
  const r = await probe(
    `groq[${i}]`,
    createGroq({ apiKey: key })(groqModel),
  )
  console.log(`  [${i}] ...${key.slice(-8)} → ${r.ok ? `OK (${r.latencyMs}ms): "${r.text}"` : `FAIL [${r.code}] ${r.msg}`}`)
}

// GEMINI
console.log()
const geminiKeys = parseKeys(process.env.GEMINI_API_KEYS)
const geminiModel = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
console.log(`GEMINI (${geminiKeys.length} keys, model: ${geminiModel})`)
for (let i = 0; i < geminiKeys.length; i++) {
  const key = geminiKeys[i]
  const r = await probe(
    `gemini[${i}]`,
    createGoogleGenerativeAI({ apiKey: key })(geminiModel),
  )
  console.log(`  [${i}] ...${key.slice(-8)} → ${r.ok ? `OK (${r.latencyMs}ms): "${r.text}"` : `FAIL [${r.code}] ${r.msg}`}`)
}

// CEREBRAS
console.log()
const cerebrasKeys = parseKeys(process.env.CEREBRAS_API_KEYS)
const cerebrasModel = process.env.CEREBRAS_MODEL ?? 'gpt-oss-120b'
console.log(`CEREBRAS (${cerebrasKeys.length} keys, model: ${cerebrasModel})`)
for (let i = 0; i < cerebrasKeys.length; i++) {
  const key = cerebrasKeys[i]
  const r = await probe(
    `cerebras[${i}]`,
    createOpenAICompatible({
      name: 'cerebras',
      apiKey: key,
      baseURL: 'https://api.cerebras.ai/v1',
    })(cerebrasModel),
  )
  console.log(`  [${i}] ...${key.slice(-8)} → ${r.ok ? `OK (${r.latencyMs}ms): "${r.text}"` : `FAIL [${r.code}] ${r.msg}`}`)
}

console.log()
