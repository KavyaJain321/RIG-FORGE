import { type NextRequest } from 'next/server'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { errorResponse } from '@/lib/api-helpers'
import { isNasEnabled, nasDownload } from '@/lib/nas/client'

// GET /api/nas/download?server=WD&path=/foo/bar.pdf — stream a NAS file to the
// browser (Trijya only). Proxies the connector response without buffering.
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)
  if (!isNasEnabled()) return errorResponse('NAS is not available', 403)

  const { searchParams } = new URL(request.url)
  const server = searchParams.get('server')
  const path = searchParams.get('path')
  const inline = searchParams.get('inline') === '1'
  if (!server || !path) return errorResponse('server and path are required', 400)

  try {
    const upstream = await nasDownload(server, path)
    if (!upstream.ok || !upstream.body) {
      return errorResponse(`Download failed (${upstream.status})`, 502)
    }
    const filename = path.split('/').filter(Boolean).pop() || 'download'
    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
    const len = upstream.headers.get('content-length')
    if (len) headers.set('Content-Length', len)
    // inline = view in the browser (PDFs/images); default = download.
    headers.set(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`,
    )
    headers.set('Cache-Control', 'private, no-store')
    return new Response(upstream.body, { status: 200, headers })
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'NAS download failed', 502)
  }
}
