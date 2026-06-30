/**
 * Pure, client-safe role helpers. Kept separate from lib/auth.ts so client
 * components can import them WITHOUT pulling server-only modules (jsonwebtoken,
 * bcrypt, node:async_hooks via the tenant context) into the browser bundle.
 */

/** Returns true for ADMIN and SUPER_ADMIN roles. */
export function isAdminRole(role: string): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}
