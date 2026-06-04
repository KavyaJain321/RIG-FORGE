/**
 * Probe several Gemini models with one fresh key to find which one
 * actually has free-tier access. The pattern is: most "free tier"
 * stops working on certain models; we need to find one that does.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'

const KEY = process.env.GEMINI_API_KEYS?.split(',')[2]?.trim() // 3rd key (new one)
if (!KEY) {
  console.error('No Gemini key found')
  process.exit(1)
}
console.log(`Using key ...${KEY.slice(-8)}\n`)

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
]

const messages = [
  { role: 'system', content: 'Reply with one word: OK' },
  { role: 'user', content: 'Ping.' },
]

for (const model of MODELS) {
  try {
    const t0 = Date.now()
    const result = await generateText({
      model: createGoogleGenerativeAI({ apiKey: KEY })(model),
      messages,
    })
    const dt = Date.now() - t0
    console.log(`  ✓ ${model.padEnd(28)} → OK (${dt}ms): "${result.text.trim()}"`)
  } catch (err) {
    const e = err
    const code = e?.statusCode ?? e?.status ?? '?'
    const msg = (e?.message ?? String(err)).split('\n')[0].slice(0, 140)
    console.log(`  ✗ ${model.padEnd(28)} → FAIL [${code}] ${msg}`)
  }
}
