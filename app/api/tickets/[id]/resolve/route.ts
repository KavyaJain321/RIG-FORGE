import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

/**
 * POST /api/tickets/[id]/resolve
 *
 * Marks a ticket as COMPLETED directly. Use when an admin has answered
 * the ticket via comments and no formal helper accepted it, or when the
 * raiser wants to close it themselves.
 *
 * Allowed callers:
 *   - The ticket raiser
 *   - The assigned helper (if any)
 *   - Any admin / super-admin
 *
 * Valid from statuses: OPEN, ACCEPTED.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    const ticket = await prisma.ticket.findUnique({ where: { id: params.id } })
    if (!ticket) return errorResponse('Ticket not found', 404)

    const isAdmin  = isAdminRole(payload.role)
    const isRaiser = ticket.raisedById === payload.userId
    const isHelper = ticket.helperId === payload.userId
    if (!isAdmin && !isRaiser && !isHelper) return errorResponse('Forbidden', 403)

    if (ticket.status !== 'OPEN' && ticket.status !== 'ACCEPTED') {
      return errorResponse('Ticket is already closed', 400)
    }

    // Atomically flip status only if still OPEN or ACCEPTED (guards against a
    // concurrent resolve/cancel), and notify in the same transaction.
    const result = await prisma.$transaction(async (tx) => {
      const flipped = await tx.ticket.updateMany({
        where: { id: params.id, status: { in: ['OPEN', 'ACCEPTED'] } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      if (flipped.count === 0) return { changed: false }

      const otherUserId =
        ticket.raisedById === payload.userId ? ticket.helperId : ticket.raisedById
      if (otherUserId && otherUserId !== payload.userId) {
        await tx.notification.create({
          data: {
            userId: otherUserId,
            type: 'TICKET_COMPLETED',
            title: 'Ticket resolved',
            body: `Ticket "${ticket.title}" has been marked as resolved.`,
            linkTo: `/dashboard/tickets/${ticket.id}`,
          },
        })
      }
      return { changed: true }
    })

    if (!result.changed) return errorResponse('Ticket is already closed', 409)

    return successResponse({ success: true, status: 'COMPLETED' })
  } catch (error) {
    console.error('[POST /api/tickets/[id]/resolve]', error)
    return errorResponse('Server error', 500)
  }
}
