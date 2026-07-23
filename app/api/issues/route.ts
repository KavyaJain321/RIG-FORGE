import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { putObject, r2Configured } from '@/lib/storage/r2'
import { notifyIssueByEmail } from '@/lib/issues/notify'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// ─── POST /api/issues ─────────────────────────────────────────────────────────
// Any authenticated user files an issue (title, description, optional screenshot).
// Stores it, then emails the developer (best-effort). Multipart form-data.
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const form = await request.formData().catch(() => null)
    if (!form) return errorResponse('Expected multipart form-data', 400)

    const title = String(form.get('title') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const pageUrl = String(form.get('pageUrl') ?? '').trim() || null
    const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 500) || null

    if (!title) return errorResponse('Title is required', 400)
    if (title.length > 150) return errorResponse('Title must not exceed 150 characters', 400)
    if (!description) return errorResponse('Description is required', 400)
    if (description.length > 4000) return errorResponse('Description must not exceed 4000 characters', 400)

    // Optional screenshot — read bytes up front (reused for both storage + email).
    let image: { filename: string; mimeType: string; content: Buffer } | null = null
    const file = form.get('image')
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith('image/')) return errorResponse('Attachment must be an image', 400)
      if (file.size > MAX_IMAGE_BYTES) return errorResponse('Image must be under 5MB', 400)
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      image = {
        filename: `screenshot.${ext}`,
        mimeType: file.type,
        content: Buffer.from(await file.arrayBuffer()),
      }
    }

    // Create the issue first (org is auto-stamped by the org-scope extension).
    const issue = await prisma.issue.create({
      data: { reporterId: payload.userId, title, description, pageUrl, userAgent },
      select: { id: true, organizationId: true, createdAt: true },
    })

    // Store the screenshot in R2 (best-effort) and record its proxy path.
    let imageUrl: string | null = null
    if (image && r2Configured()) {
      const ext = image.filename.split('.').pop() || 'png'
      const key = `issues/${issue.organizationId}/${issue.id}.${ext}`
      const ok = await putObject(key, image.content, image.mimeType)
      if (ok) {
        imageUrl = `/api/issues/media/${key}`
        await prisma.issue.update({ where: { id: issue.id }, data: { imageUrl } })
      }
    }

    // Reporter details for the email.
    const reporter = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { name: true, email: true },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || null
    const notify = await notifyIssueByEmail({
      id: issue.id,
      title,
      description,
      reporterName: reporter?.name ?? 'Unknown',
      reporterEmail: reporter?.email ?? '',
      organizationId: issue.organizationId,
      pageUrl,
      userAgent,
      appUrl,
      image,
    })
    if (!notify.sent) console.warn('[issues] email notify failed:', notify.error)

    return successResponse({ id: issue.id, imageUrl, emailed: notify.sent }, 201)
  } catch (error) {
    console.error('[POST /api/issues]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// ─── GET /api/issues ──────────────────────────────────────────────────────────
// Company-wide list of reported issues (org-scoped automatically). Any signed-in
// user sees every issue in their org — issues are a shared, collaborative log.
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') ?? ''

    const issues = await prisma.issue.findMany({
      where: { ...(status && { status: status as never }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        pageUrl: true,
        imageUrl: true,
        userAgent: true,
        createdAt: true,
        reporter: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })

    return successResponse({ items: issues })
  } catch (error) {
    console.error('[GET /api/issues]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
