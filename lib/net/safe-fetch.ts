/**
 * SSRF-safe fetch for user-supplied URLs (link previews, etc.).
 *
 * Guards against server-side request forgery: only http(s), and the host must
 * resolve to a PUBLIC IP. Redirects are followed manually so each hop is
 * re-validated (a public URL can 30x to an internal one).
 */
import { lookup } from 'dns/promises'

function isPrivateV4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true // malformed → treat as unsafe
  const [a, b] = p
  return (
    a === 0 ||                                  // 0.0.0.0/8
    a === 10 ||                                 // 10/8 private
    a === 127 ||                                // loopback
    (a === 169 && b === 254) ||                 // link-local
    (a === 172 && b >= 16 && b <= 31) ||        // 172.16/12 private
    (a === 192 && b === 168) ||                 // 192.168/16 private
    (a === 100 && b >= 64 && b <= 127) ||       // CGNAT 100.64/10
    a === 192 && p[1] === 0 && p[2] === 0 ||    // 192.0.0/24
    (a === 198 && (b === 18 || b === 19)) ||    // benchmarking 198.18/15
    a >= 224                                    // multicast + reserved 224+/240+
  )
}

function isPrivateIp(addr: string, family: number): boolean {
  if (family === 4) return isPrivateV4(addr)
  const a = addr.toLowerCase()
  if (a === '::1' || a === '::' || a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return true
  // IPv4-mapped IPv6 (::ffff:1.2.3.4)
  const m = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (m) return isPrivateV4(m[1])
  return false
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed')
  const addrs = await lookup(u.hostname, { all: true }).catch(() => [] as { address: string; family: number }[])
  if (addrs.length === 0) throw new Error('Host did not resolve')
  for (const a of addrs) if (isPrivateIp(a.address, a.family)) throw new Error('Blocked non-public address')
  return u
}

export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let url = raw
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(url)
    const res = await fetch(url, { ...init, redirect: 'manual' })
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!loc) return res
    url = new URL(loc, url).toString()
  }
  throw new Error('Too many redirects')
}
