import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

// ─── Auth helper ──────────────────────────────────────────────────────────────

type AuthOk = {
  ok: true
  payload: NonNullable<ReturnType<typeof verifyToken>>
  ticket: { id: string; raisedById: string; helperId: string | null; title: string }
  isAdmin: boolean
  isRaiser: boolean
  isHelper: boolean
}
type AuthErr = { ok: false; error: NextResponse }

async function authorize(request: NextRequest, ticketId: string): Promise<AuthOk | AuthErr> {
  const token = getTokenFromCookies(request)
  if (!token) return { ok: false, error: errorResponse('Not authenticated', 401) }
  const payload = verifyToken(token)
  if (!payload) return { ok: false, error: errorResponse('Invalid token', 401) }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, raisedById: true, helperId: true, title: true },
  })
  if (!ticket) return { ok: false, error: errorResponse('Ticket not found', 404) }

  const isAdmin  = isAdminRole(payload.role)
  const isRaiser = ticket.raisedById === payload.userId
  const isHelper = ticket.helperId === payload.userId
  if (!isAdmin && !isRaiser && !isHelper) {
    return { ok: false, error: errorResponse('Forbidden', 403) }
  }

  return { ok: true, payload, ticket, isAdmin, isRaiser, isHelper }
}

// ─── GET /api/tickets/[id]/comments ───────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const auth = await authorize(request, params.id)
    if (!auth.ok) return auth.error

    const comments = await prisma.ticketComment.findMany({
      where: { ticketId: params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, role: true } },
      },
    })

    return successResponse(
      comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        authorId: c.author.id,
        authorName: c.author.name,
        authorAvatar: c.author.avatarUrl,
        authorRole: c.author.role,
      })),
    )
  } catch (error) {
    console.error('[GET /api/tickets/[id]/comments]', error)
    return errorResponse('Server error', 500)
  }
}

// ─── POST /api/tickets/[id]/comments ──────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const auth = await authorize(request, params.id)
    if (!auth.ok) return auth.error

    let body: unknown
    try { body = await request.json() } catch { return errorResponse('Invalid JSON', 400) }
    const raw = (body as { body?: unknown }).body
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return errorResponse('Reply text is required', 400)
    }
    if (raw.length > 2000) {
      return errorResponse('Reply must be 2000 characters or fewer', 400)
    }

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: params.id,
        authorId: auth.payload.userId,
        body: raw.trim(),
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, role: true } },
      },
    })

    // Notify the other party (raiser and helper, excluding the author).
    const recipientIds = new Set<string>()
    if (auth.ticket.raisedById !== auth.payload.userId) recipientIds.add(auth.ticket.raisedById)
    if (auth.ticket.helperId && auth.ticket.helperId !== auth.payload.userId) {
      recipientIds.add(auth.ticket.helperId)
    }
    // If no helper assigned yet and admin replied, notify admins of the reply too?
    // Skip: the raiser is the primary audience until a helper accepts.

    if (recipientIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(recipientIds).map((userId) => ({
          userId,
          type: 'ADMIN_MESSAGE' as const,
          title: 'New reply on your ticket',
          body: `${comment.author.name} replied to "${auth.ticket.title}"`,
          linkTo: `/dashboard/tickets/${params.id}`,
        })),
      })
    }

    return successResponse({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      authorId: comment.author.id,
      authorName: comment.author.name,
      authorAvatar: comment.author.avatarUrl,
      authorRole: comment.author.role,
    }, 201)
  } catch (error) {
    console.error('[POST /api/tickets/[id]/comments]', error)
    return errorResponse('Server error', 500)
  }
}
