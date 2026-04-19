import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (projectId) where.projectId = projectId

    // Employees can only see tickets they raised themselves
    if (!isAdminRole(payload.role)) {
      where.raisedById = payload.userId
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { name: true } },
        raisedBy: { select: { id: true, name: true, avatarUrl: true } },
        helper: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    const result = tickets.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      projectId: t.projectId,
      projectName: t.project.name,
      raisedById: t.raisedBy.id,
      raisedByName: t.raisedBy.name,
      raisedByAvatar: t.raisedBy.avatarUrl,
      helperId: t.helper?.id ?? null,
      helperName: t.helper?.name ?? null,
      createdAt: t.createdAt,
      acceptedAt: t.acceptedAt,
      completedAt: t.completedAt,
      cancelledAt: t.cancelledAt,
    }))

    return successResponse(result)
  } catch (error) {
    console.error('[GET /api/tickets]', error)
    return errorResponse('Server error', 500)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Not authenticated', 401)
    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid token', 401)

    let body: unknown
    try { body = await request.json() } catch { return errorResponse('Invalid JSON', 400) }
    const { title, description, projectId } = body as Record<string, unknown>

    if (!title || typeof title !== 'string' || title.trim().length < 5) return errorResponse('Title must be at least 5 characters', 400)
    if (!description || typeof description !== 'string' || description.trim().length < 20) return errorResponse('Description must be at least 20 characters', 400)
    if (!projectId || typeof projectId !== 'string') return errorResponse('Project is required', 400)

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return errorResponse('Project not found', 404)

    const ticket = await prisma.ticket.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        projectId,
        raisedById: payload.userId,
        status: 'OPEN',
      },
      include: {
        project: { select: { name: true } },
        raisedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    // Notify only admins and super admins (not employees)
    const adminUsers = await prisma.user.findMany({
      where: {
        isOnboarding: false,
        id: { not: payload.userId },
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      },
      select: { id: true },
    })
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((u) => ({
          userId: u.id,
          type: 'TICKET_RAISED' as const,
          title: 'New help ticket',
          body: `${ticket.raisedBy.name} raised a ticket: "${ticket.title}"`,
          linkTo: `/dashboard/tickets/${ticket.id}`,
        })),
      })
    }

    return successResponse({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      projectId: ticket.projectId,
      projectName: ticket.project.name,
      raisedById: ticket.raisedBy.id,
      raisedByName: ticket.raisedBy.name,
      raisedByAvatar: ticket.raisedBy.avatarUrl,
      helperId: null,
      helperName: null,
      createdAt: ticket.createdAt,
      acceptedAt: null,
      completedAt: null,
      cancelledAt: null,
    }, 201)
  } catch (error) {
    console.error('[POST /api/tickets]', error)
    return errorResponse('Server error', 500)
  }
}
