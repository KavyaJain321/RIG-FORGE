/**
 * Accounts hidden from the org member directory and people pickers.
 *
 * These are QA / test logins that must be able to sign in and use the app fully
 * but must NOT appear as members to real users (People page, add-member search,
 * assignee pickers all read GET /api/users). Kept in code — not a DB column —
 * so it deploys atomically with no migration. Match is by exact, lowercased
 * email, the same normalization the login route applies.
 */
export const HIDDEN_USER_EMAILS: string[] = [
  'qa.tester@rigforge.qa',
]

const HIDDEN_LC = HIDDEN_USER_EMAILS.map((e) => e.toLowerCase())

/** True if this email belongs to a hidden QA/test account. */
export function isHiddenUserEmail(email: string | null | undefined): boolean {
  return !!email && HIDDEN_LC.includes(email.toLowerCase())
}

/**
 * Prisma `User` where-fragment that excludes hidden accounts. Spread into an
 * existing where clause: `{ ...where, ...excludeHiddenUsersWhere() }`.
 * Returns `{}` when nothing is hidden, so it's always safe to spread.
 */
export function excludeHiddenUsersWhere(): { email?: { notIn: string[] } } {
  return HIDDEN_LC.length ? { email: { notIn: HIDDEN_LC } } : {}
}
