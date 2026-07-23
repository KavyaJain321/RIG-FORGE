import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { tokenCan } from '@/lib/permissions'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { fetchProjectDetail } from '@/lib/projects'

interface RouteContext {
  params: { id: string; userId: string }
}

// ─── DELETE /api/projects/[id]/members/[userId] ──────────────────────────────
//
// Remove one member from a project. Auth: ADMIN (projects.manage) only.
// The project lead cannot be removed here — change the lead via PATCH first.
// The removed user's task assignments in this project are cleared, so no task
// is left assigned to a non-member (mirrors the assignee-must-be-a-member rule
// enforced on task creation).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    if (!tokenCan(payload, 'projects.manage')) {
      return errorResponse('Only admins can remove members from projects', 403)
    }

    const { id: projectId, userId } = params

    // Org-scoped lookup (findFirst is scoped by the extension) — guarantees the
    // caller can only touch a project in their own tenant.
    const project = await prisma.project.findFirst({
      where: { id: projectId, isActive: true },
      select: { id: true, leadId: true },
    })
    if (!project) return errorResponse('Project not found', 404)

    if (project.leadId === userId) {
      return errorResponse('Cannot remove the project lead — reassign the lead first', 400)
    }

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { id: true },
    })
    if (!membership) return errorResponse('User is not a member of this project', 404)

    await prisma.$transaction([
      // Clear this user's assignments in the project so nothing stays assigned
      // to someone who is no longer a member.
      prisma.task.updateMany({
        where: { projectId, assigneeId: userId },
        data: { assigneeId: null },
      }),
      prisma.projectMember.delete({
        where: { userId_projectId: { userId, projectId } },
      }),
    ])

    const detail = await fetchProjectDetail(projectId)
    if (!detail) return errorResponse('Failed to retrieve updated project', 500)

    return successResponse(detail)
  } catch (error) {
    console.error('[DELETE /api/projects/[id]/members/[userId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
