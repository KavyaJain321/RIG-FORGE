import { prisma } from '@/lib/db'
import { APP_NAME, APP_SHORT } from '@/lib/branding'

/**
 * Resolve white-label branding for a request HOST (pre-login) — server-only.
 * Matches Organization.domain (e.g. "forge.trijyaforge.com" → Trijya), so the
 * login/landing pages show the right brand before there's a logged-in user.
 * Falls back to the deployment default (rig360 / Rig Forge).
 */
export async function getBrandingForHost(
  host: string | null,
): Promise<{ appName: string; appShort: string; organizationId: string }> {
  const clean = (host ?? '').split(':')[0].toLowerCase().trim()
  if (clean) {
    try {
      const org = await prisma.organization.findUnique({
        where: { domain: clean },
        select: { id: true, branding: true },
      })
      if (org) {
        const b = (org.branding ?? {}) as { appName?: string; appShort?: string }
        return {
          appName: b.appName || APP_NAME,
          appShort: b.appShort || APP_SHORT,
          organizationId: org.id,
        }
      }
    } catch {
      /* fall through to default */
    }
  }
  return { appName: APP_NAME, appShort: APP_SHORT, organizationId: 'rig360' }
}
