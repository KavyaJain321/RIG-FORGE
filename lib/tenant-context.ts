import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request tenant context.
 *
 * Multi-tenancy enforcement (Phase 3). `verifyToken` calls `setOrgContext` with
 * the caller's organizationId (from their JWT) for the remainder of the request's
 * async execution — so the Prisma org-scope extension (lib/db.ts) can transparently
 * scope every query without threading the org through 95 route handlers.
 *
 * When there is no context (cron jobs, seed scripts, code that runs before auth),
 * `getOrgId()` falls back to the single-org default, which is correct today.
 */
interface TenantStore {
  organizationId: string
}

const storage = new AsyncLocalStorage<TenantStore>()

export const DEFAULT_ORG = 'rig360'

/**
 * Bind the org for the rest of the current request's async execution.
 * Uses enterWith (not run) so it can be called from inside the synchronous
 * verifyToken without wrapping every handler in a callback.
 */
export function setOrgContext(organizationId: string): void {
  storage.enterWith({ organizationId })
}

/** Run `fn` within an explicit org context (crons / scripts / background jobs). */
export function runWithOrg<T>(organizationId: string, fn: () => T): T {
  return storage.run({ organizationId }, fn)
}

/** The current request's org, or the single-org default when there's no context. */
export function getOrgId(): string {
  return storage.getStore()?.organizationId ?? DEFAULT_ORG
}
