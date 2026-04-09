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
    if (ticket.status !== 'OPEN') return errorResponse('Ticket is no longer open', 400)
    if (ticket.raisedById === payload.userId) return errorResponse('Cannot accept your own ticket', 400)

    const updated = await prisma.ticket.update({
      where: { id: params.id },
      data: { status: 'ACCEPTED', helperId: payload.userId, acceptedAt: new Date() },
      include: { helper: { select: { name: true } } },
    })

    await prisma.notification.create({
      data: {
        userId: ticket.raisedById,
        type: 'TICKET_ACCEPTED',
        title: 'Someone is helping you!',
        body: `${updated.helper?.name ?? 'Someone'} accepted your ticket: "${ticket.title}"`,
        linkTo: `/dashboard/tickets/${ticket.id}`,
      },
    })

    return successResponse({ success: true, status: updated.status })
  } catch (error) {
    console.error('[POST /api/tickets/[id]/accept]', error)
    return errorResponse('Server error', 500)
  }
}
