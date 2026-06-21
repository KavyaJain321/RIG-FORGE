// Shared client-side types for native chat (Phase 1).

export interface ChatUserLite {
  id: string
  name: string
  avatarUrl: string | null
}

export type ChatMessageKind = 'USER' | 'FORGIE' | 'SYSTEM'

export interface ChatMessageDTO {
  id: string
  conversationId: string
  senderId: string | null
  kind: ChatMessageKind
  type: 'TEXT' | 'IMAGE' | 'FILE'
  content: string
  createdAt: string
  sender?: ChatUserLite | null
}

export interface ConversationSummary {
  id: string
  type: 'DIRECT' | 'GROUP'
  title: string | null
  avatarUrl: string | null
  members: ChatUserLite[]
  lastMessage: {
    content: string
    createdAt: string
    senderId: string | null
    kind: string
  } | null
  lastMessageAt: string | null
  unread: number
}
