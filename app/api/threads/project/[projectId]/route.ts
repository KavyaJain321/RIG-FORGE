import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import type { MessageResponse } from '@/lib/types'

interface RouteContext {
  params: { projectId: string }
}

interface ThreadApiData {
  threadId: string | null
  messages: MessageResponse[]
  nextCursor: string | null
  total: number
}

function mapMessage(msg: {
  id: string
  content: string
  createdAt: Date
  updatedAt: Date
  author: { id: string; name: string; avatarUrl: string | null; role: string }
  projectThreadId: string
}): MessageResponse {
  return {
    id: msg.id,
    content: msg.content,
    authorId: msg.author.id,
    authorName: msg.author.name,
    authorAvatar: msg.author.avatarUrl,
    authorRole: msg.author.role,
    threadType: 'project',
    threadId: msg.projectThreadId,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    edited: msg.createdAt.getTime() !== msg.updatedAt.getTime(),
  }
}

// ─── GET /api/threads/project/[projectId] ──────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    const projectId = params.projectId

    // Ensure project exists and user can see it (member or admin)
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        isActive: true,
        ...(payload.role !== 'ADMIN'
          ? { members: { some: { userId: payload.userId } } }
          : {}),
      },
      select: { id: true },
    })
    if (!project) return errorResponse('Project not found', 404)

    const { searchParams } = request.nextUrl
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1),
      100,
    )
    const cursor = searchParams.get('cursor') ?? undefined

    let thread = await prisma.projectThread.findUnique({
      where: { projectId },
      select: { id: true },
    })

    if (!thread) {
      const data: ThreadApiData = {
        threadId: null,
        messages: [],
        nextCursor: null,
        total: 0,
      }
      return successResponse<ThreadApiData>(data)
    }

    const where = { projectThreadId: thread.id }

    const total = await prisma.threadMessage.count({ where })

    const msgs = await prisma.threadMessage.findMany({
      where,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: limit + 1,
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, role: true } },
      },
    })

    const hasMore = msgs.length > limit
    const page = hasMore ? msgs.slice(0, limit) : msgs
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

    const data: ThreadApiData = {
      threadId: thread.id,
      messages: page.map((m) => mapMessage(m as any)),
      nextCursor,
      total,
    }

    return successResponse<ThreadApiData>(data)
  } catch (error) {
    console.error('[GET /api/threads/project/[projectId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

// ─── POST /api/threads/project/[projectId] ─────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)

    const payload = verifyToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    const projectId = params.projectId

    // Ensure project exists and user can see it (member or admin)
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        isActive: true,
        ...(payload.role !== 'ADMIN'
          ? { members: { some: { userId: payload.userId } } }
          : {}),
      },
      select: { id: true },
    })
    if (!project) return errorResponse('Project not found', 404)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Request body must be valid JSON', 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('Request body must be a JSON object', 400)
    }

    const { content } = body as Record<string, unknown>
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('content is required', 400)
    }

    let thread = await prisma.projectThread.findUnique({
      where: { projectId },
      select: { id: true },
    })
    if (!thread) {
      thread = await prisma.projectThread.create({
        data: { projectId },
        select: { id: true },
      })
    }

    const message = await prisma.threadMessage.create({
      data: {
        content: content.trim(),
        authorId: payload.userId,
        projectThreadId: thread.id,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true, role: true } },
      },
    })

    const mapped = mapMessage(message as any)

    // Fire best-effort browser event via SSE/socket in future; for now just return
    return successResponse<MessageResponse>(mapped, 201)
  } catch (error) {
    console.error('[POST /api/threads/project/[projectId]]', error)
    return errorResponse('An unexpected error occurred', 500)
  }
}

