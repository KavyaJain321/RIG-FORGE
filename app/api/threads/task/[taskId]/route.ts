import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { MessageResponse } from '@/lib/types'

interface RouteContext {
  params: { taskId: string }
}

// ─── GET /api/threads/task/[taskId] ──────────────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { taskId } = params

    // Verify task exists and user has access
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        isActive: true,
        ...(payload.role !== 'ADMIN' && {
          project: { members: { some: { userId: payload.userId } } },
        }),
      },
      select: { id: true },
    })

    if (!task) return errorResponse('Task not found', 404)

    // Get or create thread
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
        createdAt: true,
        updatedAt: true,
        author: {
          select: { name: true, avatarUrl: true, role: true },
        },
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
    }))

    return successResponse({ items, nextCursor })
  } catch (error) {
    console.error('[GET /api/threads/task/[taskId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// ─── POST /api/threads/task/[taskId] ─────────────────────────────────────────

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired session', 401)

    const { taskId } = params

    // Verify task exists and user has access
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        isActive: true,
        ...(payload.role !== 'ADMIN' && {
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

    const { content } = body as Record<string, unknown>
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('content is required', 400)
    }
    if (content.length > 4000) {
      return errorResponse('content must not exceed 4000 characters', 400)
    }

    // Get or create thread
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
      },
      select: {
        id: true,
        content: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: { name: true, avatarUrl: true, role: true },
        },
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
    }

    return successResponse(response, 201)
  } catch (error) {
    console.error('[POST /api/threads/task/[taskId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}
