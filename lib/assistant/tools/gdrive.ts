/**
 * Google Drive tools for Forgie.
 *
 * Per-user — uses the caller's stored Google OAuth tokens. Read tools
 * need drive.readonly; write tools (create folder, create doc) use
 * drive.file scope so Forgie can only modify files IT creates.
 */

import { google } from 'googleapis'
import { Readable } from 'stream'
import { prisma } from '@/lib/db'
import {
  getAuthorizedClient,
  isGoogleConfigured,
  scopesIncludeDrive,
} from '@/lib/google/oauth'

export function isDriveConfigured(): boolean {
  return isGoogleConfigured()
}

export async function isUserDriveEnabled(userId: string): Promise<boolean> {
  if (!isGoogleConfigured()) return false
  const integ = await prisma.googleIntegration.findUnique({
    where: { userId },
    select: { scopes: true },
  })
  return integ !== null && scopesIncludeDrive(integ.scopes)
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'

// ─── Tool: search ────────────────────────────────────────────────────────────

export interface DriveSearchArgs {
  /** Free-text query (matches file name + content for indexed files) */
  query: string
  /** Optional: restrict to one file type */
  mimeType?: string
  /** Optional: restrict to files in a specific folder */
  parentFolderId?: string
  /** Default: false. Set true to include trashed files */
  includeTrashed?: boolean
  limit?: number
}

export async function searchDrive(userId: string, args: DriveSearchArgs) {
  const auth = await getAuthorizedClient(userId)
  const drive = google.drive({ version: 'v3', auth })

  // Build the Drive query DSL. `fullText contains` searches file *content*,
  // which requires the restricted drive.readonly scope. New connections use
  // drive.metadata.readonly, which rejects fullText — so we build the query
  // with fullText (best results for legacy readonly connections) and retry
  // name-only if Drive rejects it.
  const safeQuery = args.query.replace(/[\\']/g, '\\$&')
  const extraClauses: string[] = []
  if (args.mimeType) extraClauses.push(`mimeType = '${args.mimeType}'`)
  if (args.parentFolderId) extraClauses.push(`'${args.parentFolderId}' in parents`)
  if (!args.includeTrashed) extraClauses.push(`trashed = false`)

  const limit = Math.min(Math.max(args.limit ?? 15, 1), 50)
  const fields =
    'files(id, name, mimeType, modifiedTime, size, webViewLink, owners(displayName, emailAddress), parents)'

  const buildQ = (withFullText: boolean) =>
    [
      withFullText
        ? `(name contains '${safeQuery}' or fullText contains '${safeQuery}')`
        : `name contains '${safeQuery}'`,
      ...extraClauses,
    ].join(' and ')

  let res
  try {
    res = await drive.files.list({
      q: buildQ(true),
      pageSize: limit,
      fields,
      orderBy: 'modifiedTime desc',
    })
  } catch {
    // Metadata-only scope — fullText search not permitted. Retry name-only.
    res = await drive.files.list({
      q: buildQ(false),
      pageSize: limit,
      fields,
      orderBy: 'modifiedTime desc',
    })
  }

  return {
    query: args.query,
    results: (res.data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size, 10) : null,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
      owners: f.owners?.map((o) => o.displayName ?? o.emailAddress) ?? [],
      isFolder: f.mimeType === FOLDER_MIME,
    })),
  }
}

// Recently-modified files (default Drive-panel view when there's no search query).
export async function recentDriveFiles(userId: string, limit = 25) {
  const auth = await getAuthorizedClient(userId)
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.list({
    q: 'trashed = false',
    pageSize: Math.min(Math.max(limit, 1), 50),
    fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink, owners(displayName, emailAddress))',
    orderBy: 'modifiedTime desc',
  })
  return {
    results: (res.data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size, 10) : null,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
      owners: f.owners?.map((o) => o.displayName ?? o.emailAddress) ?? [],
      isFolder: f.mimeType === FOLDER_MIME,
    })),
  }
}

// ─── Tool: list folder ───────────────────────────────────────────────────────

export interface ListFolderArgs {
  folderId: string
  limit?: number
}

export async function listFolder(userId: string, args: ListFolderArgs) {
  const auth = await getAuthorizedClient(userId)
  const drive = google.drive({ version: 'v3', auth })

  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200)

  const res = await drive.files.list({
    q: `'${args.folderId}' in parents and trashed = false`,
    pageSize: limit,
    fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
    orderBy: 'folder, name',
  })

  return {
    folderId: args.folderId,
    entries: (res.data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size, 10) : null,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
      isFolder: f.mimeType === FOLDER_MIME,
    })),
  }
}

// ─── Tool: get file ──────────────────────────────────────────────────────────

export interface GetFileArgs {
  fileId: string
}

export async function getFile(userId: string, args: GetFileArgs) {
  const auth = await getAuthorizedClient(userId)
  const drive = google.drive({ version: 'v3', auth })

  // Metadata first
  const meta = await drive.files.get({
    fileId: args.fileId,
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, parents',
  })

  const mime = meta.data.mimeType ?? ''
  const size = meta.data.size ? parseInt(meta.data.size, 10) : 0

  // Only attempt to fetch content for text/markdown-ish files under 100 KB.
  // Reading file *contents* requires the restricted drive.readonly scope. New
  // connections use drive.metadata.readonly (metadata only), so content reads
  // fail — we catch that and return content=null so the caller links out to
  // Drive instead. Legacy readonly connections still get inline content.
  let content: string | null = null
  let contentUnavailable = false
  const textish = mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml'

  try {
    if (textish && size > 0 && size < 100_000) {
      const body = await drive.files.get({
        fileId: args.fileId,
        alt: 'media',
      }, { responseType: 'text' })
      content = typeof body.data === 'string' ? body.data : String(body.data)
    } else if (mime === GOOGLE_DOC_MIME) {
      // Export Google Docs as plain text
      const body = await drive.files.export({
        fileId: args.fileId,
        mimeType: 'text/plain',
      }, { responseType: 'text' })
      const text = typeof body.data === 'string' ? body.data : String(body.data)
      content = text.length > 100_000 ? text.slice(0, 100_000) + '\n\n... (truncated)' : text
    }
  } catch {
    // Metadata-only scope — no content access. Fall through with content=null.
    contentUnavailable = true
  }

  return {
    id: meta.data.id,
    name: meta.data.name,
    mimeType: mime,
    size,
    modifiedTime: meta.data.modifiedTime,
    url: meta.data.webViewLink,
    content,
    contentUnavailable,
    isTextish: textish || mime === GOOGLE_DOC_MIME,
  }
}

// ─── Write: createFolder ─────────────────────────────────────────────────────

export interface CreateFolderArgs {
  name: string
  parentFolderId?: string
}

export async function createFolder(userId: string, args: CreateFolderArgs) {
  const auth = await getAuthorizedClient(userId)
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.create({
    requestBody: {
      name: args.name.trim(),
      mimeType: FOLDER_MIME,
      ...(args.parentFolderId && { parents: [args.parentFolderId] }),
    },
    fields: 'id, name, webViewLink',
  })

  return {
    id: res.data.id,
    name: res.data.name,
    url: res.data.webViewLink,
  }
}

// ─── Write: createDoc (plain-text file or Google Doc) ────────────────────────

export interface CreateDocArgs {
  name: string
  content: string
  /** Default 'text' → creates a .txt file. 'gdoc' → creates a Google Doc. */
  format?: 'text' | 'gdoc'
  parentFolderId?: string
}

export async function createDoc(userId: string, args: CreateDocArgs) {
  const auth = await getAuthorizedClient(userId)
  const drive = google.drive({ version: 'v3', auth })

  const format = args.format ?? 'text'

  if (format === 'text') {
    // Upload as a plain .txt file
    const res = await drive.files.create({
      requestBody: {
        name: args.name.trim(),
        mimeType: 'text/plain',
        ...(args.parentFolderId && { parents: [args.parentFolderId] }),
      },
      media: {
        mimeType: 'text/plain',
        body: Readable.from(args.content),
      },
      fields: 'id, name, webViewLink',
    })
    return {
      id: res.data.id,
      name: res.data.name,
      url: res.data.webViewLink,
      format: 'text' as const,
    }
  }

  // Google Doc — upload as text, convert by setting mimeType on create
  const res = await drive.files.create({
    requestBody: {
      name: args.name.trim(),
      mimeType: GOOGLE_DOC_MIME,
      ...(args.parentFolderId && { parents: [args.parentFolderId] }),
    },
    media: {
      mimeType: 'text/plain',
      body: Readable.from(args.content),
    },
    fields: 'id, name, webViewLink',
  })
  return {
    id: res.data.id,
    name: res.data.name,
    url: res.data.webViewLink,
    format: 'gdoc' as const,
  }
}
