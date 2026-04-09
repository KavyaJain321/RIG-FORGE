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
    if (ticket.status !== 'OPEN') return errorResponse('Only open tickets can be cancelled', 400)
    if (ticket.raisedById !== payload.userId) return errorResponse('Only the ticket raiser can cancel it', 403)

    await prisma.ticket.update({ where: { id: params.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    return successResponse({ success: true, status: 'CANCELLED' })
  } catch (error) {
    console.error('[POST /api/tickets/[id]/cancel]', error)
    return errorResponse('Server error', 500)
  }
}
