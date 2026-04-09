import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import type { MessageResponse } from '@/lib/types'

export type ThreadType = 'task' | 'project'

type ThreadMessageWithAuthor = Prisma.ThreadMessageGetPayload<{
  include: { author: { select: { name: true; avatarUrl: true } } }
}>

export function buildMessageResponse(
  message: ThreadMessageWithAuthor,
  threadType: ThreadType,
  threadId: string,
): MessageResponse {
  const diffMs = message.updatedAt.getTime() - message.createdAt.getTime()
  const edited = diffMs > 1000

  return {
    id: message.id,
    content: message.content,
    authorId: message.authorId,
    authorName: message.author.name,
    authorAvatar: message.author.avatarUrl,
    threadType,
    threadId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    edited,
  }
}

export async function getThreadProjectId(
  threadType: ThreadType,
  entityId: string,
): Promise<string | null> {
  if (threadType === 'task') {
    const task = await prisma.task.findFirst({
      where: { id: entityId, isActive: true },
      select: { projectId: true },
    })
    return task?.projectId ?? null
  }

  const project = await prisma.project.findFirst({
    where: { id: entityId, isActive: true },
    select: { id: true },
  })
  return project?.id ?? null
}
