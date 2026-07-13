/**
 * Google Contacts (People API) tools.
 *
 * Per-user — uses the caller's stored Google OAuth tokens. Read-only:
 * needs the sensitive `contacts.readonly` scope (no CASA assessment).
 */

import { google } from 'googleapis'
import { prisma } from '@/lib/db'
import {
  getAuthorizedClient,
  isGoogleConfigured,
  scopesIncludeContacts,
} from '@/lib/google/oauth'

export function isContactsConfigured(): boolean {
  return isGoogleConfigured()
}

export async function isUserContactsEnabled(userId: string): Promise<boolean> {
  if (!isGoogleConfigured()) return false
  const integ = await prisma.googleIntegration.findUnique({
    where: { userId },
    select: { scopes: true },
  })
  return integ !== null && scopesIncludeContacts(integ.scopes)
}

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos'

export interface ContactCard {
  id: string
  name: string
  email: string | null
  emails: string[]
  phone: string | null
  phones: string[]
  org: string | null
  photo: string | null
}

interface RawPerson {
  resourceName?: string | null
  names?: { displayName?: string | null }[] | null
  emailAddresses?: { value?: string | null }[] | null
  phoneNumbers?: { value?: string | null }[] | null
  organizations?: { name?: string | null; title?: string | null }[] | null
  photos?: { url?: string | null }[] | null
}

function mapPerson(p: RawPerson): ContactCard {
  const emails = (p.emailAddresses ?? []).map((e) => e.value).filter((v): v is string => Boolean(v))
  const phones = (p.phoneNumbers ?? []).map((e) => e.value).filter((v): v is string => Boolean(v))
  const org = p.organizations?.[0]
  return {
    id: p.resourceName ?? '',
    name: p.names?.[0]?.displayName ?? emails[0] ?? '(no name)',
    email: emails[0] ?? null,
    emails,
    phone: phones[0] ?? null,
    phones,
    org: org?.name ?? org?.title ?? null,
    photo: p.photos?.[0]?.url ?? null,
  }
}

// "Other contacts" (auto-collected from mail) only support this narrower mask.
const OTHER_FIELDS = 'names,emailAddresses,phoneNumbers'

function dedupe(cards: ContactCard[], limit: number): ContactCard[] {
  const seen = new Set<string>()
  const out: ContactCard[] = []
  for (const c of cards) {
    const key = (c.email || c.name).toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out.slice(0, limit)
}

/** The user's contacts, alphabetical. Merges saved ("My Contacts") with
 * auto-collected "Other contacts" — many accounts have zero SAVED contacts, so
 * connections.list alone comes back empty. otherContacts is best-effort (needs
 * the contacts.other.readonly scope; silently skipped on older connections). */
export async function listContacts(userId: string, limit = 50): Promise<{ contacts: ContactCard[] }> {
  const auth = await getAuthorizedClient(userId)
  const people = google.people({ version: 'v1', auth })

  const saved = (
    await people.people.connections.list({
      resourceName: 'people/me',
      personFields: PERSON_FIELDS,
      pageSize: 100,
      sortOrder: 'FIRST_NAME_ASCENDING',
    })
  ).data.connections?.map(mapPerson) ?? []

  let other: ContactCard[] = []
  try {
    const res = await people.otherContacts.list({ readMask: OTHER_FIELDS, pageSize: 100 })
    other = res.data.otherContacts?.map(mapPerson) ?? []
  } catch {
    // scope not granted (older connection) → saved-only
  }

  const merged = dedupe([...saved, ...other], limit).sort((a, b) => a.name.localeCompare(b.name))
  return { contacts: merged }
}

/** Search across saved + other contacts by name / email / phone. */
export async function searchContacts(userId: string, query: string, limit = 30): Promise<{ contacts: ContactCard[] }> {
  const auth = await getAuthorizedClient(userId)
  const people = google.people({ version: 'v1', auth })

  const [main, other] = await Promise.all([
    people.people
      .searchContacts({ query, readMask: PERSON_FIELDS, pageSize: 30 })
      .then((r) => (r.data.results ?? []).map((x) => mapPerson(x.person ?? {})))
      .catch(() => [] as ContactCard[]),
    people.otherContacts
      .search({ query, readMask: OTHER_FIELDS, pageSize: 30 })
      .then((r) => (r.data.results ?? []).map((x) => mapPerson(x.person ?? {})))
      .catch(() => [] as ContactCard[]),
  ])
  return { contacts: dedupe([...main, ...other], limit) }
}
