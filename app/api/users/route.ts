import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { MemberSummary, PaginatedResponse } from '@/lib/types'

// ─── GET /api/users ────────────────────────────────────────────────────────────
// Paginated list of active users.
// Admins see everyone; Members see users on shared projects.

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100)
    const cursor = searchParams.get('cursor') ?? undefined
    const search = searchParams.get('search')?.trim() ?? ''
    const role = searchParams.get('role') ?? ''
    const status = searchParams.get('status') ?? ''

    // Members only see peers on shared projects
    let allowedUserIds: string[] | undefined
    if (payload.role !== 'ADMIN') {
      const memberships = await prisma.projectMember.findMany({
        where: { userId: payload.userId },
        select: { projectId: true },
      })
      const projectIds = memberships.map((m) => m.projectId)
      const peers = await prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { userId: true },
      })
      allowedUserIds = [...new Set(peers.map((p) => p.userId))]
    }

    const where = {
      isActive: true,
      ...(allowedUserIds ? { id: { in: allowedUserIds } } : {}),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(role && { role: role as never }),
      ...(status && { currentStatus: status as never }),
    }

    const total = await prisma.user.count({ where })

    const users = await prisma.user.findMany({
      where,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: limit + 1,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        currentStatus: true,
        isOnboarding: true,
        createdAt: true,
        _count: { select: { projects: true } },
        dailyActivities: {
          orderBy: { lastSeenAt: 'desc' },
          take: 1,
          select: { lastSeenAt: true },
        },
        projects: {
          take: 1,
          select: { project: { select: { name: true } } },
        },
      },
    })

    const hasMore = users.length > limit
    const page = hasMore ? users.slice(0, limit) : users
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

    const items: MemberSummary[] = page.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as MemberSummary['role'],
      avatarUrl: u.avatarUrl,
      currentStatus: u.currentStatus as MemberSummary['currentStatus'],
      lastSeenAt: u.dailyActivities[0]?.lastSeenAt ?? null,
      isOnboarding: u.isOnboarding,
      projectCount: u._count.projects,
      primaryProject: u.projects[0]?.project.name ?? null,
      createdAt: u.createdAt,
    }))

    const data: PaginatedResponse<MemberSummary> = { items, nextCursor, total }
    return successResponse(data)
  } catch (err) {
    console.error('[GET /api/users]', err)
    return errorResponse('An unexpected error occurred', 500)
  }
}
