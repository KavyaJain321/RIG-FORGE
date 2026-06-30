// Experimental (dark-theme): tokenize the chat + workspace tabs, which were
// built with a hardcoded palette (#3F7A0A green, #777/#888 grays, #EDE7FB
// purple bubbles, bg-black tints) that doesn't flip. Green button FILLS
// (bg-[#3F7A0A]/bg-[#356a08]) are left alone — they read fine in both themes.
// Run: node scripts/theme-chat-workspace-sweep.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = ['components/chat', 'components/workspace', 'app/dashboard/messages', 'app/dashboard/workspace']
const EXTS = new Set(['.tsx', '.ts'])
const FAM = 'gray|neutral|zinc|slate|stone'

const RULES = [
  // green used as TEXT/BORDER -> accent-ink (flips bright on dark). Fills kept.
  [/text-\[#3F7A0A\]/g, 'text-accent-ink'],
  [/border-\[#3F7A0A\](?!\/)/g, 'border-accent-ink'],
  // purple "mine" bubble + ink -> bubble tokens (flip to dark purple)
  [/bg-\[#EDE7FB\]/g, 'bg-bubble-mine'],
  [/text-\[#2A1A4A\]/g, 'text-bubble-mine-ink'],
  // cream empty-state panel -> surface
  [/bg-\[#F4F4EE\]/g, 'bg-surface-mid'],
  // gray text literals -> tokens
  [/text-\[#1A1A1A\]/g, 'text-text-primary'],
  [/text-\[#(?:555555|555|444|666|646464)\]/g, 'text-text-secondary'],
  [/text-\[#(?:777|888|999|999999)\]/g, 'text-text-muted'],
  // surfaces
  [/bg-white\b/g, 'bg-surface-raised'],
  [/bg-\[#(?:FFFFFF|FAFAF8|FAFAFA)\]/g, 'bg-surface-raised'],
  [/bg-\[#(?:F8F8F5|F8F8F4|F0F0EB)\]/g, 'bg-surface-highlight'],
  [/bg-\[#(?:F2F2ED|F7F7F2|F4F4F0)\]/g, 'bg-surface-mid'],
  // black-alpha borders/tints (overlays /40+ kept)
  [/border-black\/10(?![0-9])/g, 'border-border-default'],
  [/border-black\/8(?![0-9])/g, 'border-border-default'],
  [/border-black\/5(?![0-9])/g, 'border-border-subtle'],
  [/border-black\/\[0\.0[67]\]/g, 'border-border-subtle'],
  [/hover:bg-black\/10(?![0-9])/g, 'hover:bg-text-primary/10'],
  [/hover:bg-black\/5(?![0-9])/g, 'hover:bg-text-primary/[0.06]'],
  [/bg-black\/5(?![0-9])/g, 'bg-text-primary/[0.06]'],
  // tailwind-core neutrals -> tokens (dark fills 600-900 left alone)
  [new RegExp(`text-(?:${FAM})-(?:900|800)(?![0-9])`, 'g'), 'text-text-primary'],
  [new RegExp(`text-(?:${FAM})-(?:700|600)(?![0-9])`, 'g'), 'text-text-secondary'],
  [new RegExp(`text-(?:${FAM})-(?:500|400)(?![0-9])`, 'g'), 'text-text-muted'],
  [new RegExp(`bg-(?:${FAM})-(?:50|100)(?![0-9])`, 'g'), 'bg-surface-highlight'],
  [new RegExp(`bg-(?:${FAM})-(?:200|300)(?![0-9])`, 'g'), 'bg-surface-mid'],
  [new RegExp(`border-(?:${FAM})-100(?![0-9])`, 'g'), 'border-border-subtle'],
  [new RegExp(`border-(?:${FAM})-(?:200|300)(?![0-9])`, 'g'), 'border-border-default'],
  [new RegExp(`border-(?:${FAM})-(?:400|500)(?![0-9])`, 'g'), 'border-border-strong'],
]

function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
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
