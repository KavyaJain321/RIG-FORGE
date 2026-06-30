// Experimental (dark-theme): map Tailwind-core neutral utilities (gray/neutral/
// zinc/slate/stone) onto theme tokens so they flip with the toggle.
// Dark fills (bg-/border- 600-900) are left alone (intentional dark elements).
// Run: node scripts/theme-core-neutrals-sweep.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = ['app', 'components']
const EXTS = new Set(['.tsx', '.ts'])
const FAM = 'gray|neutral|zinc|slate|stone'
// Intentionally all-dark components — leave their own dark palette untouched.
const SKIP_FILES = new Set(['LogoutLogModal.tsx'])

// [shade list, prefix, token] — shades matched with (?![0-9]) so 50 != 500.
const MAP = [
  // text: dark shades -> primary, mid -> secondary, light -> muted
  [['900', '800'], 'text', 'text-text-primary'],
  [['700', '600'], 'text', 'text-text-secondary'],
  // shade 300 deliberately NOT mapped: it's used as light-on-dark (badges,
  // chevrons) and stays readable on dark either way.
  [['500', '400'], 'text', 'text-text-muted'],
  // backgrounds: light tints -> subtle/mid surfaces (dark shades left alone)
  [['50', '100'], 'bg', 'bg-surface-highlight'],
  [['200', '300'], 'bg', 'bg-surface-mid'],
  // borders: light -> subtle/default (dark shades left alone)
  [['100'], 'border', 'border-border-subtle'],
  [['200', '300'], 'border', 'border-border-default'],
  [['400', '500'], 'border', 'border-border-strong'],
]

const RULES = []
for (const [shades, prefix, token] of MAP) {
  for (const sh of shades) {
    RULES.push([new RegExp(`${prefix}-(?:${FAM})-${sh}(?![0-9])`, 'g'), token])
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { yield* walk(p); continue }
    if (EXTS.has(extname(p)) && !SKIP_FILES.has(name)) yield p
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
