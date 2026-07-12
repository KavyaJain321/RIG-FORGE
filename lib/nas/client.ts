/**
 * Server-side client for the Trijya NAS connector (Python+pysmb service on
 * TRIJYA-3, fronted by the Cloudflare Tunnel at TRIJYA_NAS_BASE_URL and gated
 * by the same Cloudflare Access service token as the local LLM).
 *
 * NAS access is a per-org capability — only the org that owns the NAS (Trijya)
 * gets it. Enablement = TRIJYA_NAS_BASE_URL set AND current org === NAS_ORG_ID
 * (default 'trijya'). Everything here is server-only.
 */
import { getOrgId } from '@/lib/tenant-context'

const BASE = process.env.TRIJYA_NAS_BASE_URL?.trim().replace(/\/$/, '')
const NAS_ORG_ID = process.env.NAS_ORG_ID?.trim() || 'trijya'
const TIMEOUT_MS = Number(process.env.NAS_TIMEOUT_MS ?? 25_000)

/** True when the NAS connector is configured AND the caller's org owns it. */
export function isNasEnabled(): boolean {
  return !!BASE && getOrgId() === NAS_ORG_ID
}

function accessHeaders(): Record<string, string> {
  const id = process.env.CF_ACCESS_CLIENT_ID?.trim()
  const secret = process.env.CF_ACCESS_CLIENT_SECRET?.trim()
  return id && secret
    ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }
    : {}
}

function assertEnabled() {
  if (!BASE) throw new Error('NAS is not configured')
  if (!isNasEnabled()) throw new Error('NAS is not available for this organization')
}

async function nasFetch(path: string, init: RequestInit = {}): Promise<Response> {
  assertEnabled()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...accessHeaders(), ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  })
  return res
}

export interface NasEntry {
  name: string
  isDir: boolean
  size: number
  mtime: number
}

export interface NasServer {
  label: string
}

// The server list is static config — cache it briefly so hot paths (the NAS
// fast-lane) don't spend a tunnel round-trip fetching it every time.
let serversCache: { at: number; servers: NasServer[] } | null = null

export async function nasServers(): Promise<NasServer[]> {
  if (serversCache && Date.now() - serversCache.at < 300_000) return serversCache.servers
  const r = await nasFetch('/servers')
  if (!r.ok) throw new Error(`NAS servers failed (${r.status})`)
  const j = (await r.json()) as { servers: NasServer[] }
  const servers = j.servers ?? []
  serversCache = { at: Date.now(), servers }
  return servers
}

export async function nasList(server: string, path = '/'): Promise<{ path: string; items: NasEntry[] }> {
  const r = await nasFetch(`/list?server=${encodeURIComponent(server)}&path=${encodeURIComponent(path)}`)
  if (!r.ok) throw new Error(`NAS list failed (${r.status})`)
  return (await r.json()) as { path: string; items: NasEntry[] }
}

export interface NasSearchHit {
  name: string
  path: string
  isDir: boolean
  size: number
}

export async function nasSearch(
  server: string,
  q: string,
  opts: { path?: string; limit?: number } = {},
): Promise<{ results: NasSearchHit[]; truncated: boolean }> {
  const params = new URLSearchParams({ server, q, path: opts.path ?? '/', limit: String(opts.limit ?? 40) })
  const r = await nasFetch(`/search?${params.toString()}`)
  if (!r.ok) throw new Error(`NAS search failed (${r.status})`)
  const j = (await r.json()) as { results: NasSearchHit[]; truncated: boolean }
  return { results: j.results ?? [], truncated: !!j.truncated }
}

/** Proxy a file download from the NAS. Returns the upstream Response so the
 * route can stream it straight to the client without buffering in memory. */
export async function nasDownload(server: string, path: string): Promise<Response> {
  return nasFetch(
    `/download?server=${encodeURIComponent(server)}&path=${encodeURIComponent(path)}`,
    // downloads can be large; give them their own longer budget
    { signal: AbortSignal.timeout(Number(process.env.NAS_DOWNLOAD_TIMEOUT_MS ?? 120_000)) },
  )
}

/** Fetch a file's raw bytes (for text extraction by Forgie tools). Capped. */
export async function nasFetchBytes(server: string, path: string, maxBytes = 8_000_000): Promise<Buffer> {
  const r = await nasDownload(server, path)
  if (!r.ok) throw new Error(`NAS download failed (${r.status})`)
  const buf = Buffer.from(await r.arrayBuffer())
  return buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf
}

export async function nasUpload(server: string, path: string, file: Blob, filename: string): Promise<{ ok: boolean; path: string }> {
  const form = new FormData()
  form.append('file', file, filename)
  const r = await nasFetch(
    `/upload?server=${encodeURIComponent(server)}&path=${encodeURIComponent(path)}`,
    { method: 'POST', body: form, signal: AbortSignal.timeout(Number(process.env.NAS_UPLOAD_TIMEOUT_MS ?? 120_000)) },
  )
  if (!r.ok) throw new Error(`NAS upload failed (${r.status})`)
  return (await r.json()) as { ok: boolean; path: string }
}
