import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { MemberSummary, PaginatedResponse } from '@/lib/types'

// ─── GET /api/users ────────────────────────────────────────────────────────────
// Paginated list of active users.
//
// ADMIN  → sees all users with full MemberSummary
// EMPLOYEE → sees only self (full) + project teammates (reduced shape)
//   Reduced shape: email='', lastSeenAt=null, projectCount=0, primaryProject=null
//   isOwnProfile tells the frontend which card belongs to the viewer

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
    const roleFilter = searchParams.get('role') ?? ''
    const statusFilter = searchParams.get('status') ?? ''

    // ── ADMIN PATH ─────────────────────────────────────────────────────────────
    if (payload.role === 'ADMIN') {
      const where = {
        isActive: true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
        ...(roleFilter && { role: roleFilter as never }),
        ...(statusFilter && { currentStatus: statusFilter as never }),
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
        isOwnProfile: u.id === payload.userId,
      }))

      return successResponse<PaginatedResponse<MemberSummary>>({ items, nextCursor, total })
    }

    // ── EMPLOYEE PATH ──────────────────────────────────────────────────────────
    // Step 1: find projects the viewer belongs to
    const viewerMemberships = await prisma.projectMember.findMany({
      where: { userId: payload.userId },
      select: { projectId: true },
    })
    const viewerProjectIds = viewerMemberships.map((m) => m.projectId)

    // Step 2: find all unique teammate IDs (exclude self)
    const teammateRows = viewerProjectIds.length > 0
      ? await prisma.projectMember.findMany({
          where: {
            projectId: { in: viewerProjectIds },
            userId: { not: payload.userId },
          },
          select: { userId: true },
        })
      : []
    const uniqueTeammateIds = [...new Set(teammateRows.map((t) => t.userId))]

    // Always include self (even if no projects)
    const allowedIds = [payload.userId, ...uniqueTeammateIds]

    // Apply search filter client-side-ish — filter allowedIds by search
    const where = {
      isActive: true,
      id: { in: allowedIds },
      ...(search && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
      // Employees cannot filter by role/status (admin-only filters ignored)
    }

    const total = await prisma.user.count({ where })

    // Fetch full data for self, minimal data for teammates
    const users = await prisma.user.findMany({
      where,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: limit + 1,
      orderBy: [
        // own card first
        { id: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        email: true,          // will be masked for teammates
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

    const items: MemberSummary[] = page.map((u) => {
      const isSelf = u.id === payload.userId
      return {
        id: u.id,
        name: u.name,
        // Teammates: strip sensitive fields
        email: isSelf ? u.email : '',
        role: u.role as MemberSummary['role'],
        avatarUrl: u.avatarUrl,
        currentStatus: u.currentStatus as MemberSummary['currentStatus'],
        lastSeenAt: isSelf ? (u.dailyActivities[0]?.lastSeenAt ?? null) : null,
        isOnboarding: u.isOnboarding,
        projectCount: isSelf ? u._count.projects : 0,
        primaryProject: isSelf ? (u.projects[0]?.project.name ?? null) : null,
        createdAt: u.createdAt,
        isOwnProfile: isSelf,
      }
    })

    // Sort: own card first, then alphabetical
    items.sort((a, b) => {
      if (a.isOwnProfile) return -1
      if (b.isOwnProfile) return 1
      return a.name.localeCompare(b.name)
    })

    return successResponse<PaginatedResponse<MemberSummary>>({ items, nextCursor, total })
  } catch (err) {
    console.error('[GET /api/users]', err)
    return errorResponse('An unexpected error occurred', 500)
  }
}
