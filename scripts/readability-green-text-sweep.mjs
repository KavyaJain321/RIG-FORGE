// One-off: darken lime/green used as TEXT to the accent-ink token (#3F7A0A).
// Bright #85D933 as text is ~1.6:1 on light surfaces (unreadable). Only the
// foreground `text-*` utilities are touched — `bg-accent`, `border-accent`,
// `bg-status-success`, opacity tints, etc. are left bright/intact.
// Run: node scripts/readability-green-text-sweep.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = ['app', 'components']
const EXTS = new Set(['.tsx', '.ts'])

const RULES = [
  // hover/base lime text -> readable dark lime. Order matters: -hover first so
  // the plain `text-accent` rule's negative-lookahead doesn't need to handle it.
  [/text-accent-hover\b/g, 'text-accent-ink'],
  [/text-accent(?!-)/g, 'text-accent-ink'],
  [/text-status-success\b/g, 'text-accent-ink'],
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { yield* walk(p); continue }
    if (EXTS.has(extname(p))) yield p
  }
}

let files = 0, total = 0
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    let out = src, n = 0
    for (const [re, to] of RULES) out = out.replace(re, () => { n++; return to })
    if (n > 0) {
      files++; total += n
      console.log(`${String(n).padStart(3)}  ${file}`)
      if (!DRY) writeFileSync(file, out)
    }
  }
}
console.log(`\n${DRY ? '[dry] ' : ''}${total} replacements across ${files} files`)
