/**
 * GET /api/assistant/conversations/[id]   — fetch one conversation + messages
 * DELETE /api/assistant/conversations/[id] — delete (cascades to messages)
 * PATCH /api/assistant/conversations/[id]  — rename / pin / archive
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

interface RouteContext {
  params: { id: string }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired session', 401)

    const conversation = await prisma.assistantConversation.findFirst({
      where: { id: params.id, userId: claims.userId },
      include: {
        messages: {
          where: { role: { in: ['USER', 'ASSISTANT'] } }, // hide SYSTEM and TOOL from UI
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            provider: true,
            model: true,
            latencyMs: true,
            createdAt: true,
          },
        },
      },
    })

    if (!conversation) return errorResponse('Conversation not found', 404)

    return successResponse({
      id: conversation.id,
      title: conversation.title,
      isPinned: conversation.isPinned,
      isArchived: conversation.isArchived,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages,
    })
  } catch (error) {
    console.error('[GET /api/assistant/conversations/[id]]', error)
    return errorResponse('Failed to load conversation', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired session', 401)

    // Ownership check via deleteMany with the user predicate — atomic
    const result = await prisma.assistantConversation.deleteMany({
      where: { id: params.id, userId: claims.userId },
    })
    if (result.count === 0) return errorResponse('Conversation not found', 404)

    return successResponse({ deleted: true, id: params.id })
  } catch (error) {
    console.error('[DELETE /api/assistant/conversations/[id]]', error)
    return errorResponse('Failed to delete conversation', 500)
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired session', 401)

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

    const data: { title?: string | null; isPinned?: boolean; isArchived?: boolean } = {}

    if (raw.title !== undefined) {
      if (raw.title === null) {
        data.title = null
      } else if (typeof raw.title === 'string') {
        const trimmed = raw.title.trim()
        if (trimmed.length === 0) return errorResponse('title cannot be empty', 400)
        if (trimmed.length > 200) return errorResponse('title must not exceed 200 characters', 400)
        data.title = trimmed
      } else {
        return errorResponse('title must be a string or null', 400)
      }
    }
    if (raw.isPinned !== undefined) {
      if (typeof raw.isPinned !== 'boolean') return errorResponse('isPinned must be a boolean', 400)
      data.isPinned = raw.isPinned
    }
    if (raw.isArchived !== undefined) {
      if (typeof raw.isArchived !== 'boolean') return errorResponse('isArchived must be a boolean', 400)
      data.isArchived = raw.isArchived
    }

    if (Object.keys(data).length === 0) {
      return errorResponse('No valid fields provided', 400)
    }

    const result = await prisma.assistantConversation.updateMany({
      where: { id: params.id, userId: claims.userId },
      data,
    })
    if (result.count === 0) return errorResponse('Conversation not found', 404)

    const updated = await prisma.assistantConversation.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        isPinned: true,
        isArchived: true,
        updatedAt: true,
      },
    })
    return successResponse(updated)
  } catch (error) {
    console.error('[PATCH /api/assistant/conversations/[id]]', error)
    return errorResponse('Failed to update conversation', 500)
  }
}
