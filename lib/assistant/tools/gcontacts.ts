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

/** The user's contacts, alphabetical. Default panel view. */
export async function listContacts(userId: string, limit = 50): Promise<{ contacts: ContactCard[] }> {
  const auth = await getAuthorizedClient(userId)
  const people = google.people({ version: 'v1', auth })
  const res = await people.people.connections.list({
    resourceName: 'people/me',
    personFields: PERSON_FIELDS,
    pageSize: Math.min(Math.max(limit, 1), 100),
    sortOrder: 'FIRST_NAME_ASCENDING',
  })
  return { contacts: (res.data.connections ?? []).map(mapPerson) }
}

/** Search the user's contacts by name / email / phone. */
export async function searchContacts(userId: string, query: string, limit = 30): Promise<{ contacts: ContactCard[] }> {
  const auth = await getAuthorizedClient(userId)
  const people = google.people({ version: 'v1', auth })
  const res = await people.people.searchContacts({
    query,
    readMask: PERSON_FIELDS,
    pageSize: Math.min(Math.max(limit, 1), 30),
  })
  return { contacts: (res.data.results ?? []).map((r) => mapPerson(r.person ?? {})) }
}
