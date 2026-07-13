import { type NextRequest } from 'next/server'

import { errorResponse } from '@/lib/api-helpers'
import { nasDownloadByToken } from '@/lib/nas/client'
import { verifyShareToken } from '@/lib/nas/share-token'

// GET /api/nas/shared?token=... — download a NAS file via a signed share link.
// NO session required: the signed token IS the authorization (single file,
// expiring). Streams the file inline so it opens in the browser.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return errorResponse('Missing token', 400)

  const claims = verifyShareToken(token)
  if (!claims) return errorResponse('This share link is invalid or has expired.', 403)

  try {
    const upstream = await nasDownloadByToken(claims.server, claims.path)
    if (!upstream.ok || !upstream.body) return errorResponse(`File unavailable (${upstream.status})`, 502)
    const filename = claims.path.split('/').filter(Boolean).pop() || 'download'
    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
    const len = upstream.headers.get('content-length')
    if (len) headers.set('Content-Length', len)
    headers.set('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`)
    headers.set('Cache-Control', 'private, no-store')
    return new Response(upstream.body, { status: 200, headers })
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Download failed', 502)
  }
}
