import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, isAdminRole } from '@/lib/auth'
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

    // Employees can only view tickets they raised themselves
    if (!isAdminRole(payload.role) && ticket.raisedById !== payload.userId) {
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
      acceptedAt: ticket.acceptedAt,
      completedAt: ticket.completedAt,
      cancelledAt: ticket.cancelledAt,
    })
  } catch (error) {
    console.error('[GET /api/tickets/[id]]', error)
    return errorResponse('Server error', 500)
  }
}
