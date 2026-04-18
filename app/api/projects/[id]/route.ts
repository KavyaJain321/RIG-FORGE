import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { fetchProjectDetail, fetchProjectSummary, isMemberOfProject } from '@/lib/projects'
import type { ProjectDetail, ProjectSummary, ProjectLink } from '@/lib/types'

interface RouteContext {
  params: { id: string }
}

// ─── GET /api/projects/[id] ───────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<ReturnType<typeof successResponse<ProjectDetail>> | ReturnType<typeof errorResponse>> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const projectId = params.id

    if (!isAdminRole(payload.role)) {
      // For employees: return 404 for both non-existent AND non-member projects
      // to avoid revealing that a project exists
      const membership = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: payload.userId, projectId } },
        select: { id: true },
      })
      if (!membership) return errorResponse('Project not found', 404)
    } else {
      // Admin: just verify it exists and is active
      const exists = await prisma.project.findUnique({
        where: { id: projectId, isActive: true },
        select: { id: true },
      })
      if (!exists) return errorResponse('Project not found', 404)
    }

    const detail = await fetchProjectDetail(projectId)
    if (!detail) return errorResponse('Project not found', 404)
    return successResponse(detail)
  } catch (error) {
    console.error('[GET /api/projects/[id]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// ─── PATCH /api/projects/[id] ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
): Promise<ReturnType<typeof successResponse<ProjectSummary>> | ReturnType<typeof errorResponse>> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const projectId = params.id

    // Fetch project to check leadId and isActive
    const project = await prisma.project.findUnique({
      where: { id: projectId, isActive: true },
      select: { id: true, leadId: true },
    })
    if (!project) return errorResponse('Project not found', 404)

    const isAdmin = isAdminRole(payload.role)
    const isLead = project.leadId === payload.userId

    // Only admin or project lead can PATCH
    if (!isAdmin && !isLead) return errorResponse('Access denied', 403)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Request body must be valid JSON', 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('Request body must be a JSON object', 400)
    }

    const raw = body as Record<string, unknown>
    const { name, description, status, priority, deadline, leadId, links } = raw

    const validStatuses = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

    const data: {
      name?: string
      description?: string | null
      status?: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      deadline?: Date | null
      leadId?: string | null
      links?: ProjectLink[]
    } = {}

    // ── Admin-only fields ─────────────────────────────────────────────────────
    if (isAdmin) {
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          return errorResponse('name must be a non-empty string', 400)
        }
        // Reject HTML/script tags (BUG-002)
        if (/<[^>]+>/i.test(name)) {
          return errorResponse('Project name must not contain HTML or script tags', 400)
        }
        data.name = name.trim()
      }

      if (status !== undefined) {
        if (typeof status !== 'string' || !validStatuses.includes(status)) {
          return errorResponse('status is invalid', 400)
        }
        data.status = status as 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
      }

      if (priority !== undefined) {
        if (typeof priority !== 'string' || !validPriorities.includes(priority)) {
          return errorResponse('priority is invalid', 400)
        }
        data.priority = priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      }

      if (deadline !== undefined) {
        if (deadline === null || deadline === '') {
          data.deadline = null
        } else if (typeof deadline === 'string') {
          const parsed = new Date(deadline)
          if (Number.isNaN(parsed.getTime())) {
            return errorResponse('deadline must be a valid ISO date string', 400)
          }
          data.deadline = parsed
        } else {
          return errorResponse('deadline must be null or an ISO string', 400)
        }
      }

      if (leadId !== undefined) {
        if (leadId === null) {
          data.leadId = null
        } else if (typeof leadId === 'string' && leadId.trim().length > 0) {
          const leadUser = await prisma.user.findUnique({
            where: { id: leadId, isActive: true },
            select: { id: true },
          })
          if (!leadUser) return errorResponse('leadId must reference a valid active user', 400)
          data.leadId = leadId.trim()
        } else {
          return errorResponse('leadId must be null or a non-empty string', 400)
        }
      }
    }

    // ── Admin OR lead fields ──────────────────────────────────────────────────
    if (description !== undefined) {
      // Reject HTML/script tags (BUG-002)
      if (typeof description === 'string' && /<[^>]+>/i.test(description)) {
        return errorResponse('Project description must not contain HTML or script tags', 400)
      }
      data.description = typeof description === 'string' ? description.trim() : null
    }

    if (links !== undefined) {
      if (!Array.isArray(links)) {
        return errorResponse('links must be an array', 400)
      }
      if (links.length > 5) {
        return errorResponse('links must not exceed 5 items', 400)
      }
      for (const link of links) {
        if (
          !link ||
          typeof link !== 'object' ||
          typeof (link as Record<string, unknown>).label !== 'string' ||
          typeof (link as Record<string, unknown>).url !== 'string'
        ) {
          return errorResponse('each link must have a label and url string', 400)
        }
      }
      data.links = links as ProjectLink[]
    }

    if (Object.keys(data).length === 0) {
      return errorResponse('No valid fields provided', 400)
    }

    await prisma.project.update({
      where: { id: projectId },
      data: data as never,
    })

    const summary = await fetchProjectSummary(projectId)
    if (!summary) return errorResponse('Failed to retrieve updated project', 500)
    return successResponse(summary)
  } catch (error) {
    console.error('[PATCH /api/projects/[id]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// ─── DELETE /api/projects/[id] ────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext,
): Promise<ReturnType<typeof successResponse<{ id: string }>> | ReturnType<typeof errorResponse>> {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    if (!isAdminRole(payload.role)) return errorResponse('Admin access required', 403)

    const projectId = params.id
    const project = await prisma.project.findUnique({
      where: { id: projectId, isActive: true },
      select: { id: true },
    })
    if (!project) return errorResponse('Project not found', 404)

    await prisma.project.update({
      where: { id: projectId },
      data: { isActive: false, status: 'ARCHIVED' as never },
    })

    return successResponse({ id: projectId })
  } catch (error) {
    console.error('[DELETE /api/projects/[id]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
