'use client'

import { useAuthStore } from '@/store/authStore'
import { APP_NAME, APP_SHORT } from '@/lib/branding'

/**
 * Per-org branding for client components. Reads the logged-in user's org
 * branding (populated by /api/auth/me + login) so the app shell renders
 * "TRIJYA FORGE" / "TF" for a Trijya user and the defaults for everyone else.
 * Falls back to the deployment defaults before the user is loaded.
 */
export function useBranding(): { appName: string; appShort: string; appNameUpper: string } {
  const user = useAuthStore((s) => s.user)
  const appName = user?.orgName || APP_NAME
  const appShort = user?.orgShort || APP_SHORT
  return { appName, appShort, appNameUpper: appName.toUpperCase() }
}
