import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    const ticket = await prisma.ticket.findUnique({ where: { id: params.id } })
    if (!ticket) return errorResponse('Ticket not found', 404)
    if (ticket.status !== 'ACCEPTED') return errorResponse('Only accepted tickets can be completed', 400)
    if (ticket.raisedById !== payload.userId && ticket.helperId !== payload.userId) {
      return errorResponse('Only the ticket raiser or helper can complete it', 403)
    }

    // Atomically flip status only if still ACCEPTED (guards against a
    // concurrent complete/cancel), and write the notification in the same
    // transaction so we never notify on a no-op.
    const result = await prisma.$transaction(async (tx) => {
      const flipped = await tx.ticket.updateMany({
        where: { id: params.id, status: 'ACCEPTED' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      if (flipped.count === 0) return { changed: false }

      const otherUserId = ticket.raisedById === payload.userId ? ticket.helperId : ticket.raisedById
      if (otherUserId) {
        await tx.notification.create({
          data: {
            userId: otherUserId,
            type: 'TICKET_COMPLETED',
            title: 'Ticket resolved',
            body: `Ticket "${ticket.title}" has been marked as completed.`,
            linkTo: `/dashboard/tickets/${ticket.id}`,
          },
        })
      }
      return { changed: true }
    })

    if (!result.changed) return errorResponse('Ticket is no longer in a completable state', 409)

    return successResponse({ success: true, status: 'COMPLETED' })
  } catch (error) {
    console.error('[POST /api/tickets/[id]/complete]', error)
    return errorResponse('Server error', 500)
  }
}
