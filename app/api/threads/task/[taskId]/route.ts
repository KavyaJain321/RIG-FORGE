import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken, isAdminRole } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { MessageResponse } from '@/lib/types'

interface RouteContext {
  params: { taskId: string }
}

// ─── GET /api/threads/task/[taskId] ──────────────────────────────────────────
// Task threads are always TEAM visibility — no LEAD_ADMIN filtering needed.

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { taskId } = params

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        isActive: true,
        ...(!isAdminRole(payload.role) && {
          project: { members: { some: { userId: payload.userId } } },
        }),
      },
      select: { id: true },
    })
    if (!task) return errorResponse('Task not found', 404)

    const thread = await prisma.taskThread.upsert({
      where: { taskId },
      create: { taskId },
      update: {},
      select: { id: true },
    })

    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1), 100)
    const cursor = searchParams.get('cursor') ?? undefined

    const messages = await prisma.threadMessage.findMany({
      where: { taskThreadId: thread.id },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: limit + 1,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        content: true,
        authorId: true,
        visibility: true,
        fileUrl: true,
        fileName: true,
        fileType: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { name: true, avatarUrl: true, role: true } },
      },
    })

    const hasMore = messages.length > limit
    const page = hasMore ? messages.slice(0, limit) : messages
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

    const items: MessageResponse[] = page.map((m) => ({
      id: m.id,
      content: m.content,
      authorId: m.authorId,
      authorName: m.author.name,
      authorAvatar: m.author.avatarUrl,
      authorRole: m.author.role,
      threadType: 'task',
      threadId: thread.id,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      edited: m.createdAt.getTime() !== m.updatedAt.getTime(),
      visibility: m.visibility as 'TEAM' | 'LEAD_ADMIN',
      fileUrl: m.fileUrl,
      fileName: m.fileName,
      fileType: m.fileType,
    }))

    return successResponse({ items, nextCursor })
  } catch (error) {
    console.error('[GET /api/threads/task/[taskId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// ─── POST /api/threads/task/[taskId] ─────────────────────────────────────────
// Task thread messages are always TEAM visibility.

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { taskId } = params

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        isActive: true,
        ...(!isAdminRole(payload.role) && {
          project: { members: { some: { userId: payload.userId } } },
        }),
      },
      select: { id: true },
    })
    if (!task) return errorResponse('Task not found', 404)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Request body must be valid JSON', 400)
    }

    const { content, fileUrl, fileName, fileType } = body as Record<string, unknown>
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('content is required', 400)
    }
    if (content.length > 4000) {
      return errorResponse('content must not exceed 4000 characters', 400)
    }

    const safeFileUrl = typeof fileUrl === 'string' && fileUrl.trim() ? fileUrl.trim() : null
    const safeFileName = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : null
    const safeFileType = safeFileUrl ? (typeof fileType === 'string' ? fileType.trim() : 'link') : null

    const thread = await prisma.taskThread.upsert({
      where: { taskId },
      create: { taskId },
      update: {},
      select: { id: true },
    })

    const message = await prisma.threadMessage.create({
      data: {
        content: content.trim(),
        authorId: payload.userId,
        taskThreadId: thread.id,
        visibility: 'TEAM', // task threads are always team-visible
        fileUrl: safeFileUrl,
        fileName: safeFileName,
        fileType: safeFileType,
      },
      select: {
        id: true,
        content: true,
        authorId: true,
        visibility: true,
        fileUrl: true,
        fileName: true,
        fileType: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { name: true, avatarUrl: true, role: true } },
      },
    })

    const response: MessageResponse = {
      id: message.id,
      content: message.content,
      authorId: message.authorId,
      authorName: message.author.name,
      authorAvatar: message.author.avatarUrl,
      authorRole: message.author.role,
      threadType: 'task',
      threadId: thread.id,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      edited: message.createdAt.getTime() !== message.updatedAt.getTime(),
      visibility: 'TEAM',
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileType: message.fileType,
    }

    return successResponse(response, 201)
  } catch (error) {
    console.error('[POST /api/threads/task/[taskId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
