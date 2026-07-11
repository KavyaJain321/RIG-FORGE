import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { tokenCan } from '@/lib/permissions'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { id: true, name: true } },
        raisedBy: { select: { id: true, name: true, avatarUrl: true } },
        helper: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
    if (!ticket) return errorResponse('Ticket not found', 404)

    // Non-admins can view tickets they raised OR were assigned to help with
    if (
      !tokenCan(payload, 'tickets.manage') &&
      ticket.raisedById !== payload.userId &&
      ticket.helperId !== payload.userId
    ) {
      return errorResponse('Forbidden', 403)
    }

    return successResponse({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      projectId: ticket.project.id,
      projectName: ticket.project.name,
      raisedById: ticket.raisedBy.id,
      raisedByName: ticket.raisedBy.name,
      raisedByAvatar: ticket.raisedBy.avatarUrl,
      helperId: ticket.helper?.id ?? null,
      helperName: ticket.helper?.name ?? null,
      helperAvatar: ticket.helper?.avatarUrl ?? null,
      createdAt: ticket.createdAt,
      editedAt: ticket.editedAt,
      acceptedAt: ticket.acceptedAt,
      completedAt: ticket.completedAt,
      cancelledAt: ticket.cancelledAt,
    })
  } catch (error) {
    console.error('[GET /api/tickets/[id]]', error)
    return errorResponse('Server error', 500)
  }
}

/**
 * PATCH /api/tickets/[id] — edit a ticket's title/description after creation.
 *
 * Restricted to admins / super-admins (tickets.manage). The raiser cannot edit.
 * Allowed only while the ticket is still open/in-progress (not COMPLETED/
 * CANCELLED). Sets editedAt so the helper can see details changed.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    })
    if (!ticket) return errorResponse('Ticket not found', 404)

    if (!tokenCan(payload, 'tickets.manage')) {
      return errorResponse('Only admins can edit tickets', 403)
    }
    if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
      return errorResponse('This ticket is closed and can no longer be edited', 400)
    }

    let body: unknown
    try { body = await request.json() } catch { return errorResponse('Invalid JSON', 400) }
    const { title, description } = body as Record<string, unknown>

    const data: { title?: string; description?: string; editedAt: Date } = { editedAt: new Date() }
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 5) return errorResponse('Title must be at least 5 characters', 400)
      data.title = title.trim()
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length < 20) return errorResponse('Description must be at least 20 characters', 400)
      data.description = description.trim()
    }
    if (data.title === undefined && data.description === undefined) {
      return errorResponse('Nothing to update', 400)
    }

    const updated = await prisma.ticket.update({
      where: { id: params.id },
      data,
      select: { id: true, title: true, description: true, editedAt: true },
    })
    return successResponse(updated)
  } catch (error) {
    console.error('[PATCH /api/tickets/[id]]', error)
    return errorResponse('Server error', 500)
  }
}
