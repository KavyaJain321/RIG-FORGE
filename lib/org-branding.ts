import { prisma } from '@/lib/db'
import { APP_NAME, APP_SHORT } from '@/lib/branding'
import { DEFAULT_ORG } from '@/lib/tenant-context'

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

/**
 * Server-only. Resolve the caller-org's identity for server-generated text
 * (Forgie system prompt, welcome, notifications). Gives the per-org app name and
 * whether this is the origin org (rig360) — only rig360 gets the rich RIG 360
 * grounding baked into Forgie's prompt; every other tenant stays generic so it
 * never sees RIG's name or project portfolio.
 */
export async function getOrgIdentity(
  organizationId: string,
): Promise<{ appName: string; appShort: string; nameUpper: string; isDefaultOrg: boolean }> {
  const { orgName, orgShort } = await getOrgBranding(organizationId)
  return {
    appName: orgName,
    appShort: orgShort,
    nameUpper: orgName.toUpperCase(),
    isDefaultOrg: organizationId === DEFAULT_ORG,
  }
}
