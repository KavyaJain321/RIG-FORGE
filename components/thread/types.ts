export type ThreadType = 'task' | 'blocker' | 'project'

export interface MessageResponse {
  id: string
  content: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  threadType: ThreadType
  threadId: string
  createdAt: Date
  updatedAt: Date
  edited: boolean
}

// Messages in local state may carry an optimistic flag (not from server)
export type LocalMessage = MessageResponse & { optimistic?: boolean }
