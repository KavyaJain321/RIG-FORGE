/**
 * Shared NAS file → text extraction (used by the Forgie nas_read tool and the
 * NAS read fast-path). Supports plain text, spreadsheets, and PDFs. Binary
 * formats (CAD, images) return a short note instead of throwing.
 */
import * as XLSX from 'xlsx'

const TEXTY = new Set(['txt', 'csv', 'md', 'log', 'json', 'xml', 'svg', 'ini', 'yaml', 'yml', 'tsv', 'rtf'])
export const EXTRACTABLE = new Set([...TEXTY, 'pdf', 'xlsx', 'xls'])
const MAX_TEXT = 12_000

export function fileExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

export function isExtractable(name: string): boolean {
  return EXTRACTABLE.has(fileExt(name))
}

export async function extractText(name: string, buf: Buffer): Promise<string> {
  const x = fileExt(name)
  if (TEXTY.has(x)) return buf.toString('utf8').slice(0, MAX_TEXT)
  if (x === 'pdf') {
    try {
      // Import the lib entry directly — the package index runs a debug block
      // that reads a test file when it thinks it's the main module, which
      // throws under a bundler.
      const mod = await import('pdf-parse/lib/pdf-parse.js')
      const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>
      const data = await pdfParse(buf)
      const t = (data.text || '').replace(/\n{3,}/g, '\n\n').trim()
      return t ? t.slice(0, MAX_TEXT) : '(this PDF has no selectable text — likely a scanned drawing/image; download it to view)'
    } catch (e) {
      return `(could not extract text from PDF ${name}: ${e instanceof Error ? e.message.slice(0, 80) : 'error'})`
    }
  }
  if (x === 'xlsx' || x === 'xls') {
    try {
      const wb = XLSX.read(buf, { type: 'buffer' })
      let out = ''
      for (const s of wb.SheetNames.slice(0, 5)) {
        out += `# Sheet: ${s}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s]!).slice(0, 4000) + '\n\n'
      }
      return out.slice(0, MAX_TEXT) || '(empty spreadsheet)'
    } catch {
      return `(could not parse spreadsheet ${name})`
    }
  }
  return `(binary ${x || 'file'}, ${buf.length} bytes — text extraction for this type isn't supported yet; download it to view)`
}
