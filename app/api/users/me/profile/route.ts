import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { verifyToken, getTokenFromCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { AuthUser } from '@/lib/types'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ProjectEntry {
  id: string
  name: string
  status: string
  isLead: boolean
  joinedAt: Date
}

interface ActivityEntry {
  date: string
  wasActive: boolean
}

interface DailyLogEntry {
  date: string
  workSummary: string
  notes: string | null
}

export interface ProfileResponse {
  user: AuthUser
  projects: ProjectEntry[]
  activityThisWeek: ActivityEntry[]
  dailyLogsThisWeek: DailyLogEntry[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getSevenDaysAgo(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - 6)
  return d
}

function buildWeekDates(): string[] {
  const dates: string[] = []
  const start = getSevenDaysAgo()
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

// ─── PATCH /api/users/me/profile ──────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired token', 401)

    const body = await request.json() as { name?: string; avatarUrl?: string }
    const updateData: { name?: string; avatarUrl?: string } = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length === 0) return errorResponse('Name cannot be empty', 400)
      updateData.name = name
    }
    if (body.avatarUrl !== undefined) {
      updateData.avatarUrl = body.avatarUrl ?? undefined
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse('No fields to update', 400)
    }

    const updated = await prisma.user.update({
      where: { id: claims.userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        currentStatus: true,
        isOnboarding: true,
        mustChangePassword: true,
        createdAt: true,
      },
    })

    const user: AuthUser = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role as AuthUser['role'],
      avatarUrl: updated.avatarUrl ?? null,
      currentStatus: updated.currentStatus as AuthUser['currentStatus'],
      isOnboarding: updated.isOnboarding,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt,
    }

    return successResponse(user)
  } catch (error) {
    console.error('[PATCH /api/users/me/profile] Unexpected error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// ─── GET /api/users/me/profile ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired token', 401)

    const userId = claims.userId
    const sevenDaysAgo = getSevenDaysAgo()

    const [userRecord, memberRows, activityRows, logRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatarUrl: true,
          currentStatus: true,
          isOnboarding: true,
          mustChangePassword: true,
          createdAt: true,
        },
      }),
      prisma.projectMember.findMany({
        where: { userId },
        include: {
          project: {
            select: { id: true, name: true, status: true, leadId: true },
          },
        },
        orderBy: { joinedAt: 'desc' },
      }),
      prisma.dailyActivity.findMany({
        where: { userId, date: { gte: sevenDaysAgo } },
        orderBy: { date: 'asc' },
      }),
      prisma.dailyLog.findMany({
        where: { userId, date: { gte: sevenDaysAgo } },
        orderBy: { date: 'desc' },
      }),
    ])

    if (!userRecord) return errorResponse('User not found', 404)

    const user: AuthUser = {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      role: userRecord.role as AuthUser['role'],
      avatarUrl: userRecord.avatarUrl ?? null,
      currentStatus: userRecord.currentStatus as AuthUser['currentStatus'],
      isOnboarding: userRecord.isOnboarding,
      mustChangePassword: userRecord.mustChangePassword,
      createdAt: userRecord.createdAt,
    }

    const projects: ProjectEntry[] = memberRows.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      status: m.project.status,
      isLead: m.project.leadId === userId,
      joinedAt: m.joinedAt,
    }))

    // Build a map of date → wasActive from DB rows
    const activityMap = new Map<string, boolean>(
      activityRows.map((a) => [
        new Date(a.date).toISOString().slice(0, 10),
        a.wasActive,
      ])
    )

    const activityThisWeek: ActivityEntry[] = buildWeekDates().map((date) => ({
      date,
      wasActive: activityMap.get(date) ?? false,
    }))

    const dailyLogsThisWeek: DailyLogEntry[] = logRows.map((l) => ({
      date: new Date(l.date).toISOString().slice(0, 10),
      workSummary: l.workSummary,
      notes: l.notes ?? null,
    }))

    const response: ProfileResponse = {
      user,
      projects,
      activityThisWeek,
      dailyLogsThisWeek,
    }

    return successResponse(response)
  } catch (error) {
    console.error('[GET /api/users/me/profile] Unexpected error:', error)
    return errorResponse('Internal server error', 500)
  }
}
