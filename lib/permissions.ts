/**
 * Fine-grained capability system for custom roles.
 *
 * Pure + client-safe (no server-only imports) so both API routes and client
 * components can import it — mirrors lib/roles.ts.
 *
 * Model:
 *   - The coarse Role enum (SUPER_ADMIN | ADMIN | EMPLOYEE) still exists and
 *     still drives every legacy gate via isAdminRole().
 *   - A user MAY additionally be assigned a CustomRole, which carries a set of
 *     capability keys. Capability-aware gates check those keys via can().
 *   - SUPER_ADMIN always has every capability.
 *   - ADMIN with no custom role has every capability (unchanged behavior).
 *   - EMPLOYEE with no custom role has none.
 *   - Any user WITH a custom role uses exactly that role's capability set,
 *     letting you build e.g. a "Manager" that can do some admin things but not all.
 */

export interface Capability {
  key: string
  label: string
  group: string
  /** Longer help text shown under the toggle. */
  hint?: string
}

/** The full catalog of togglable capabilities. Keep keys stable — they're stored in the DB. */
export const CAPABILITIES: Capability[] = [
  { key: 'members.view', label: 'View all members', group: 'People', hint: 'See every teammate profile, not just their own.' },
  { key: 'members.manage', label: 'Add & remove members', group: 'People', hint: 'Generate new users and deactivate accounts.' },
  { key: 'members.reset_password', label: 'Reset passwords', group: 'People' },
  { key: 'onboarding.approve', label: 'Approve onboarding', group: 'People' },
  { key: 'projects.view_all', label: 'View all projects', group: 'Projects' },
  { key: 'projects.manage', label: 'Create & edit projects', group: 'Projects' },
  { key: 'tasks.manage', label: 'Manage all tasks', group: 'Tasks' },
  { key: 'tickets.manage', label: 'Manage tickets', group: 'Tickets' },
  { key: 'reports.view', label: 'View reports', group: 'Reports' },
  { key: 'reports.manage', label: 'Generate & edit reports', group: 'Reports' },
  { key: 'notifications.send', label: 'Send notifications', group: 'Communication' },
  { key: 'whatsapp.send', label: 'Send WhatsApp messages', group: 'Communication' },
  { key: 'assistant.admin', label: 'Forgie admin tools', group: 'Assistant' },
]

export const CAPABILITY_KEYS: string[] = CAPABILITIES.map((c) => c.key)

/** Groups in display order, each with its capabilities. */
export function capabilityGroups(): { group: string; items: Capability[] }[] {
  const order: string[] = []
  const map = new Map<string, Capability[]>()
  for (const c of CAPABILITIES) {
    if (!map.has(c.group)) { map.set(c.group, []); order.push(c.group) }
    map.get(c.group)!.push(c)
  }
  return order.map((group) => ({ group, items: map.get(group)! }))
}

/** True if every key is a known capability. */
export function areValidCapabilities(keys: unknown): keys is string[] {
  return Array.isArray(keys) && keys.every((k) => typeof k === 'string' && CAPABILITY_KEYS.includes(k))
}

export interface CustomRoleLike {
  permissions: string[]
}

/**
 * Resolve the effective capability set for a user, given their enum role and
 * optional assigned custom role.
 */
export function resolveCapabilities(role: string, customRole?: CustomRoleLike | null): Set<string> {
  if (role === 'SUPER_ADMIN') return new Set(CAPABILITY_KEYS)
  if (customRole) return new Set(customRole.permissions.filter((k) => CAPABILITY_KEYS.includes(k)))
  if (role === 'ADMIN') return new Set(CAPABILITY_KEYS)
  return new Set()
}

/** True if the resolved capability set grants the given capability. */
export function can(capabilities: Set<string>, key: string): boolean {
  return capabilities.has(key)
}

/**
 * Capability check straight off a JWT/session payload — no DB read.
 *
 * A token carries an explicit `capabilities` array ONLY when the user has an
 * assigned custom role. So:
 *   - SUPER_ADMIN            → always true
 *   - has custom role        → check the embedded capability list
 *   - ADMIN (no custom role) → true  (unchanged legacy admin access)
 *   - EMPLOYEE (no custom role) → false
 *
 * This makes swapping isAdminRole(role) → tokenCan(payload, cap) behavior-
 * preserving for every existing admin/employee; only custom-role users refine.
 */
export function tokenCan(payload: { role: string; capabilities?: string[] | null }, key: string): boolean {
  if (payload.role === 'SUPER_ADMIN') return true
  if (payload.capabilities) return payload.capabilities.includes(key)
  if (payload.role === 'ADMIN') return true
  return false
}

/** Null-safe capability check for client components (user may be undefined while loading). */
export function userCan(
  user: { role: string; capabilities?: string[] | null } | null | undefined,
  key: string,
): boolean {
  return user ? tokenCan(user, key) : false
}
