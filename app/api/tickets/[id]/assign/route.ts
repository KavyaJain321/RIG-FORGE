import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { tokenCan } from '@/lib/permissions'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { sendPushToUsers } from '@/lib/push/send'

/**
 * POST /api/tickets/[id]/assign — admin assigns a ticket to a chosen teammate.
 *
 * Restricted to tickets.manage (admins/super-admins). Sets the helper to the
 * chosen user and moves the ticket to ACCEPTED, then notifies the assignee
 * (in-app notification + web push) and the raiser.
 *
 * Body: { helperId: string }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    if (!tokenCan(payload, 'tickets.manage')) return errorResponse('Only admins can assign tickets', 403)

    let body: unknown
    try { body = await request.json() } catch { return errorResponse('Invalid JSON', 400) }
    const { helperId } = body as Record<string, unknown>
    if (!helperId || typeof helperId !== 'string') return errorResponse('helperId is required', 400)

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true, raisedById: true, helperId: true },
    })
    if (!ticket) return errorResponse('Ticket not found', 404)
    if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
      return errorResponse('This ticket is closed and cannot be assigned', 400)
    }
    if (helperId === ticket.raisedById) {
      return errorResponse('You cannot assign a ticket back to the person who raised it', 400)
    }

    const assignee = await prisma.user.findUnique({
      where: { id: helperId },
      select: { id: true, name: true, isActive: true },
    })
    if (!assignee || !assignee.isActive) return errorResponse('Assignee not found or inactive', 404)

    if (ticket.helperId === helperId && ticket.status === 'ACCEPTED') {
      return errorResponse(`This ticket is already assigned to ${assignee.name}`, 400)
    }

    await prisma.ticket.update({
      where: { id: params.id },
      data: { status: 'ACCEPTED', helperId, acceptedAt: new Date() },
    })

    // Notify the assignee (in-app + push) and the raiser.
    await prisma.notification.createMany({
      data: [
        {
          userId: assignee.id,
          type: 'TICKET_ASSIGNED',
          title: 'A ticket was assigned to you',
          body: `You've been assigned to help with: "${ticket.title}"`,
          linkTo: `/dashboard/tickets/${ticket.id}`,
        },
        {
          userId: ticket.raisedById,
          type: 'TICKET_ACCEPTED',
          title: 'Someone is helping you!',
          body: `${assignee.name} was assigned to your ticket: "${ticket.title}"`,
          linkTo: `/dashboard/tickets/${ticket.id}`,
        },
      ],
    })
    // Web push to the assignee (fire-and-forget; no-ops if push isn't configured).
    void sendPushToUsers([assignee.id], {
      title: 'A ticket was assigned to you',
      body: `You've been assigned to help with: "${ticket.title}"`,
      url: `/dashboard/tickets/${ticket.id}`,
      tag: `ticket-${ticket.id}`,
    })

    return successResponse({ success: true, helperId: assignee.id, helperName: assignee.name })
  } catch (error) {
    console.error('[POST /api/tickets/[id]/assign]', error)
    return errorResponse('Server error', 500)
  }
}
