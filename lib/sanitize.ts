/**
 * Lightweight input guards for user/LLM-supplied free text that gets stored
 * and later rendered. Rejecting raw HTML/script tags at write time matches the
 * guard already used on project name/description and prevents stored-XSS-shaped
 * content from landing in task/ticket fields.
 */

const HTML_TAG_RE = /<[^>]+>/i

/** Throws if `value` contains an HTML/script tag. No-op for empty/undefined. */
export function assertNoHtml(value: string | null | undefined, label: string): void {
  if (value && HTML_TAG_RE.test(value)) {
    throw new Error(`${label} must not contain HTML/script tags`)
  }
}
