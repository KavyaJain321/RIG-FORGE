export type ThreadType = 'task' | 'blocker' | 'project'

export interface MessageResponse {
  id: string
  content: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  authorRole?: string
  threadType: ThreadType
  threadId: string
  createdAt: Date
  updatedAt: Date
  edited: boolean
  visibility: 'TEAM' | 'LEAD_ADMIN'
  fileUrl?: string | null
  fileName?: string | null
  fileType?: string | null
}

// Messages in local state may carry an optimistic flag (not from server)
export type LocalMessage = MessageResponse & { optimistic?: boolean }
