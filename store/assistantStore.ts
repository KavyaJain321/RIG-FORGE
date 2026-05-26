'use client'

/**
 * Forgie chat state — a single conversation at a time in v0.
 * Multi-conversation history sidebar is a Phase 2 polish.
 */

import { create } from 'zustand'

export interface PendingAction {
  actionId: string
  action: 'create_task' | 'create_ticket' | 'update_task_status' | string
  args: Record<string, unknown>
  label: string
  status: 'pending' | 'confirming' | 'confirmed' | 'cancelled' | 'failed'
  resultText?: string  // human label once executed
  errorText?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  cached?: boolean
  fallback?: boolean
  pendingActions?: PendingAction[]
  createdAt: Date
}

export interface ConversationSummary {
  id: string
  title: string | null
  messageCount: number
  updatedAt: string
  isPinned: boolean
}

type View = 'chat' | 'history'

interface AssistantState {
  isOpen: boolean
  view: View
  conversationId: string | null
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  conversations: ConversationSummary[]
  conversationsLoaded: boolean
  conversationsLoading: boolean

  open: () => void
  close: () => void
  toggle: () => void
  setView: (view: View) => void
  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>

  appendUser: (content: string) => void
  appendAssistant: (content: string, meta?: Partial<ChatMessage>) => void
  /** For streaming: create an empty assistant message we can fill in later. */
  beginAssistant: () => string  // returns the message id
  /** Append a token chunk to a streaming assistant message. */
  appendDelta: (messageId: string, delta: string) => void
  /** Finalize a streaming assistant message with metadata. */
  finalizeAssistant: (messageId: string, patch: Partial<ChatMessage>) => void
  updateActionStatus: (
    messageId: string,
    actionId: string,
    patch: Partial<PendingAction>,
  ) => void
  setSending: (sending: boolean) => void
  setError: (err: string | null) => void
  setConversationId: (id: string) => void
  reset: () => void
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  isOpen: false,
  view: 'chat',
  conversationId: null,
  messages: [],
  isSending: false,
  error: null,
  conversations: [],
  conversationsLoaded: false,
  conversationsLoading: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, view: 'chat' }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, view: 'chat' })),
  setView: (view) => set({ view }),

  loadConversations: async () => {
    if (get().conversationsLoading) return
    set({ conversationsLoading: true })
    try {
      const res = await fetch('/api/assistant/conversations?limit=40', {
        credentials: 'include',
      })
      if (!res.ok) {
        set({ conversationsLoading: false })
        return
      }
      const json = (await res.json()) as {
        data?: Array<{
          id: string
          title: string | null
          messageCount: number
          updatedAt: string
          isPinned: boolean
        }>
      }
      set({
        conversations: json.data ?? [],
        conversationsLoaded: true,
        conversationsLoading: false,
      })
    } catch {
      set({ conversationsLoading: false })
    }
  },

  selectConversation: async (id) => {
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        credentials: 'include',
      })
      if (!res.ok) return
      const json = (await res.json()) as {
        data?: {
          id: string
          title: string | null
          messages: Array<{
            id: string
            role: 'USER' | 'ASSISTANT'
            content: string
            provider: string | null
            createdAt: string
          }>
        }
      }
      if (!json.data) return
      const messages: ChatMessage[] = json.data.messages.map((m) => ({
        id: m.id,
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
        provider: m.provider,
        createdAt: new Date(m.createdAt),
      }))
      set({
        conversationId: json.data.id,
        messages,
        view: 'chat',
        error: null,
      })
    } catch {
      // ignore
    }
  },

  appendUser: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'user',
          content,
          createdAt: new Date(),
        },
      ],
      error: null,
    })),

  appendAssistant: (content, meta = {}) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          content,
          createdAt: new Date(),
          ...meta,
        },
      ],
    })),

  beginAssistant: () => {
    const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: 'assistant', content: '', createdAt: new Date() },
      ],
    }))
    return id
  },

  appendDelta: (messageId, delta) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, content: m.content + delta } : m,
      ),
    })),

  finalizeAssistant: (messageId, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
    })),

  updateActionStatus: (messageId, actionId, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.pendingActions) return m
        return {
          ...m,
          pendingActions: m.pendingActions.map((a) =>
            a.actionId === actionId ? { ...a, ...patch } : a,
          ),
        }
      }),
    })),

  setSending: (sending) => set({ isSending: sending }),
  setError: (err) => set({ error: err }),
  setConversationId: (id) => set({ conversationId: id }),

  reset: () =>
    set({
      conversationId: null,
      messages: [],
      isSending: false,
      error: null,
    }),
}))
