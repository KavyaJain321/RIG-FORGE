/**
 * Company/instance registry + per-instance Prisma clients for the hidden
 * developer console (/dashboard/dev).
 *
 * Each white-label company runs the same codebase against an isolated Postgres
 * SCHEMA (rig360 → `public`, trijya → `trijya`) — for now all inside the same
 * database project, so ONE running instance can reach every company's schema by
 * swapping the `schema` search param on DATABASE_URL. A company on a wholly
 * separate database can be added via the DEV_INSTANCES env var with its own
 * `databaseUrl`.
 *
 * IMPORTANT: these clients are deliberately UNSCOPED — they do NOT carry the
 * org-scope extension from lib/db.ts. The dev console must see EVERY user in the
 * target schema, and the org-scope extension would (wrongly) filter another
 * company's rows down to the caller's own org. Cross-tenant reads here are
 * intentional and gated by the DEV_DASHBOARD_EMAILS allowlist at the route.
 */

import { PrismaClient } from '@prisma/client'

export interface DevInstance {
  id: string
  label: string
  schema: string
  /**
   * Optional organizationId filter. The `public` schema can hold more than one
   * org (the real company plus ghost/test orgs from multi-tenancy testing), so
   * the primary instance pins its own org to avoid surfacing test artifacts. A
   * schema that holds exactly one company (e.g. trijya) can omit this.
   */
  organizationId?: string
  /**
   * Optional full DATABASE_URL for a company that lives on its own database.
   * When omitted, we reuse process.env.DATABASE_URL with `schema` swapped.
   */
  databaseUrl?: string
}

// Built-in companies. Both live in the `public` schema and are separated by
// organizationId (the multi-tenant model). NOTE: there is also a legacy, empty
// `trijya` SCHEMA from the pre-multi-tenancy white-label approach — do NOT point
// here; the live trijya data is public + organizationId='trijya'.
const BUILTIN: DevInstance[] = [
  { id: 'rig360', label: process.env.NEXT_PUBLIC_APP_NAME || 'RIG FORGE', schema: 'public', organizationId: 'rig360' },
  { id: 'trijya', label: 'TRIJYA FORGE', schema: 'public', organizationId: 'trijya' },
]

/**
 * Extra companies injected without a code change, e.g.:
 *   DEV_INSTANCES='[{"id":"acme","label":"ACME","schema":"acme","databaseUrl":"postgres://..."}]'
 * An entry whose id matches a built-in overrides it.
 */
function fromEnv(): DevInstance[] {
  const raw = process.env.DEV_INSTANCES
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as DevInstance[]
    return Array.isArray(parsed)
      ? parsed.filter((i) => i && typeof i.id === 'string' && typeof i.schema === 'string')
      : []
  } catch {
    return []
  }
}

export function listInstances(): DevInstance[] {
  const merged = new Map<string, DevInstance>()
  for (const i of BUILTIN) merged.set(i.id, i)
  for (const i of fromEnv()) merged.set(i.id, i)
  return [...merged.values()]
}

/** Resolve an instance by id; falls back to the first (primary) when id is absent. */
export function getInstance(id: string | null | undefined): DevInstance | null {
  const all = listInstances()
  if (!id) return all[0] ?? null
  return all.find((i) => i.id === id) ?? null
}

function buildUrl(inst: DevInstance): string {
  if (inst.databaseUrl) return inst.databaseUrl
  const base = process.env.DATABASE_URL
  if (!base) throw new Error('DATABASE_URL is not configured')
  const u = new URL(base)
  u.searchParams.set('schema', inst.schema)
  return u.toString()
}

// Cache one client per instance (a long-running Node server, so this is safe and
// avoids exhausting the connection pool). Kept on globalThis so Next's dev-mode
// module reloads don't leak new pools on every edit.
const globalForDev = globalThis as unknown as {
  devInstanceClients?: Map<string, PrismaClient>
}
const cache = globalForDev.devInstanceClients ?? new Map<string, PrismaClient>()
globalForDev.devInstanceClients = cache

export function getInstanceClient(inst: DevInstance): PrismaClient {
  const existing = cache.get(inst.id)
  if (existing) return existing
  const client = new PrismaClient({ datasourceUrl: buildUrl(inst), log: ['error'] })
  cache.set(inst.id, client)
  return client
}
