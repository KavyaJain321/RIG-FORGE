// Experimental: migrate hardcoded light-theme literals onto theme-aware tokens
// so the dark-mode toggle actually flips them. Scope: app/ + components/.
// Run: node scripts/theme-token-sweep.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = ['app', 'components']
const EXTS = new Set(['.tsx', '.ts'])

// [regex, replacement]. text-white is intentionally NOT touched (it sits on
// dark fills that stay dark). bg-black/40+ overlays are left alone too.
const RULES = [
  // text colors
  [/text-\[#1A1A1A\]/g, 'text-text-primary'],
  [/text-\[#555555\]/g, 'text-text-secondary'],
  [/text-\[#5C5C5C\]/g, 'text-text-secondary'],
  [/text-\[#444444\]/g, 'text-text-secondary'],
  [/text-\[#444\]/g, 'text-text-secondary'],
  [/text-\[#555\]/g, 'text-text-secondary'],
  [/text-\[#646464\]/g, 'text-text-muted'],
  // surface backgrounds
  [/bg-\[#FFFFFF\]/g, 'bg-surface-raised'],
  [/bg-\[#FAFAF8\]/g, 'bg-surface-raised'],
  [/bg-\[#FAFAFA\]/g, 'bg-surface-raised'],
  [/bg-\[#EAEAE4\]/g, 'bg-background-primary'],
  [/bg-\[#F8F8F5\]/g, 'bg-surface-highlight'],
  [/bg-\[#F8F8F4\]/g, 'bg-surface-highlight'],
  [/bg-\[#F0F0EB\]/g, 'bg-surface-highlight'],
  [/bg-\[#F2F2ED\]/g, 'bg-surface-mid'],
  [/bg-\[#F2F2EE\]/g, 'bg-surface-mid'],
  [/bg-\[#F7F7F2\]/g, 'bg-surface-mid'],
  [/bg-\[#F4F4F0\]/g, 'bg-surface-mid'],
  [/bg-white\b/g, 'bg-surface-raised'],
  // borders (lookahead so /5 doesn't match inside /50)
  [/border-black\/10(?![0-9])/g, 'border-border-default'],
  [/border-black\/8(?![0-9])/g, 'border-border-default'],
  [/border-black\/5(?![0-9])/g, 'border-border-subtle'],
  [/border-black\/15(?![0-9])/g, 'border-border-strong'],
  [/border-black\/20(?![0-9])/g, 'border-border-strong'],
  [/border-black\/30(?![0-9])/g, 'border-border-strong'],
  [/border-black\/\[0\.07\]/g, 'border-border-default'],
  [/border-black\/\[0\.06\]/g, 'border-border-subtle'],
  // subtle hover tints — flip via text-primary alpha (dark in light, light in dark)
  [/hover:bg-black\/10(?![0-9])/g, 'hover:bg-text-primary/10'],
  [/hover:bg-black\/5(?![0-9])/g, 'hover:bg-text-primary/[0.06]'],
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
