// Shared client-side types for native chat (Phase 1).

export interface ChatUserLite {
  id: string
  name: string
  avatarUrl: string | null
}

export type ChatMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER'

// A conversation member, including when they last read it (drives seen/✓✓).
export interface ChatMember extends ChatUserLite {
  lastReadAt: string | null
  role?: ChatMemberRole
}

export type ChatMessageKind = 'USER' | 'FORGIE' | 'SYSTEM'

export interface ChatMessageDTO {
  id: string
  conversationId: string
  senderId: string | null
  kind: ChatMessageKind
  type: 'TEXT' | 'IMAGE' | 'FILE'
  content: string
  replyToId?: string | null
  deliveredAt?: string | null
  editedAt?: string | null
  deletedAt?: string | null
  createdAt: string
  sender?: ChatUserLite | null
}

export interface ConversationSummary {
  id: string
  type: 'DIRECT' | 'GROUP'
  title: string | null
  avatarUrl: string | null
  members: ChatMember[]
  lastMessage: {
    content: string
    createdAt: string
    senderId: string | null
    kind: string
  } | null
  lastMessageAt: string | null
  unread: number
}
