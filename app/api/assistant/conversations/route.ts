/**
 * GET /api/assistant/conversations
 *
 * List the current user's conversations, most recently updated first.
 * Pagination is simple offset-based for now (chat history is small).
 */

import { type NextRequest } from 'next/server'

import { prisma } from '@/lib/db'
import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request)
    if (!token) return errorResponse('Authentication required', 401)
    const claims = verifyToken(token)
    if (!claims) return errorResponse('Invalid or expired session', 401)

    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100)
    const includeArchived = searchParams.get('archived') === 'true'

    const conversations = await prisma.assistantConversation.findMany({
      where: {
        userId: claims.userId,
        ...(!includeArchived && { isArchived: false }),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        isPinned: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    })

    return successResponse(
      conversations.map((c) => ({
        id: c.id,
        title: c.title,
        isPinned: c.isPinned,
        isArchived: c.isArchived,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    )
  } catch (error) {
    console.error('[GET /api/assistant/conversations]', error)
    return errorResponse('Failed to load conversations', 500)
  }
}
