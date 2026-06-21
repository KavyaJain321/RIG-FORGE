// One-off: darken low-contrast gray text literals for readability (WCAG AA).
// Scope: app/ and components/ only. Tokens in tailwind.config.ts handled separately.
// Run: node scripts/readability-gray-sweep.mjs        (writes)
//      node scripts/readability-gray-sweep.mjs --dry   (report only)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = ['app', 'components']
const EXTS = new Set(['.tsx', '.ts', '.css'])

// 6-digit first (so 3-digit rules don't partial-match), then 3-digit with a
// negative lookahead so #AAA inside #AAAAAA is never touched twice.
const RULES = [
  [/#A1A1AA\b/gi, '#646464'],
  [/#A1A1A1\b/gi, '#646464'],
  [/#AAAAAA\b/gi, '#646464'],
  [/#999999\b/gi, '#646464'],
  [/#888888\b/gi, '#5C5C5C'],
  [/#777777\b/gi, '#555555'],
  [/#666666\b/gi, '#555555'],
  [/#AAA(?![0-9A-Fa-f])/gi, '#646464'],
  [/#999(?![0-9A-Fa-f])/gi, '#646464'],
  [/#888(?![0-9A-Fa-f])/gi, '#5C5C5C'],
  [/#777(?![0-9A-Fa-f])/gi, '#555555'],
  [/#666(?![0-9A-Fa-f])/gi, '#555555'],
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { yield* walk(p); continue }
    if (EXTS.has(extname(p))) yield p
  }
}

let totalFiles = 0
let totalReplacements = 0
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    let out = src
    let fileCount = 0
    for (const [re, to] of RULES) {
      out = out.replace(re, () => { fileCount++; return to })
    }
    if (fileCount > 0) {
      totalFiles++
      totalReplacements += fileCount
      console.log(`${fileCount.toString().padStart(3)}  ${file}`)
      if (!DRY) writeFileSync(file, out)
    }
  }
}
console.log(`\n${DRY ? '[dry] ' : ''}${totalReplacements} replacements across ${totalFiles} files`)
