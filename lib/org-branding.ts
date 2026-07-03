import { prisma } from '@/lib/db'
import { APP_NAME, APP_SHORT } from '@/lib/branding'

/**
 * Resolve an organization's white-label branding (server-only — uses Prisma).
 * Organization.branding is a JSON blob { appName, appShort }. Falls back to the
 * deployment defaults (Rig Forge / RF) when an org has no override. Used when
 * building AuthUser so the client shell can render per-org names.
 */
export async function getOrgBranding(
  organizationId: string,
): Promise<{ orgName: string; orgShort: string }> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { branding: true },
    })
    const b = (org?.branding ?? {}) as { appName?: string; appShort?: string }
    return { orgName: b.appName || APP_NAME, orgShort: b.appShort || APP_SHORT }
  } catch {
    return { orgName: APP_NAME, orgShort: APP_SHORT }
  }
}
