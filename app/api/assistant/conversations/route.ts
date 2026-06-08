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
    // Default is WEB only — WhatsApp conversations are kept out of the
    // sidebar unless explicitly requested. ?channel=ALL to mix; ?channel=WHATSAPP
    // to view only WA history.
    const channelParam = searchParams.get('channel')?.toUpperCase()
    const channelFilter =
      channelParam === 'ALL'
        ? undefined
        : channelParam === 'WHATSAPP'
          ? 'WHATSAPP'
          : 'WEB'

    const conversations = await prisma.assistantConversation.findMany({
      where: {
        userId: claims.userId,
        ...(!includeArchived && { isArchived: false }),
        ...(channelFilter && { channel: channelFilter }),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        channel: true,
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
        channel: c.channel,
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
