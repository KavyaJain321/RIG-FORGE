'use client'

/**
 * Forgie chat state — a single conversation at a time in v0.
 * Multi-conversation history sidebar is a Phase 2 polish.
 */

import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  cached?: boolean
  fallback?: boolean
  createdAt: Date
}

interface AssistantState {
  isOpen: boolean
  conversationId: string | null
  messages: ChatMessage[]
  isSending: boolean
  error: string | null

  open: () => void
  close: () => void
  toggle: () => void

  appendUser: (content: string) => void
  appendAssistant: (content: string, meta?: Partial<ChatMessage>) => void
  setSending: (sending: boolean) => void
  setError: (err: string | null) => void
  setConversationId: (id: string) => void
  reset: () => void
}

export const useAssistantStore = create<AssistantState>((set) => ({
  isOpen: false,
  conversationId: null,
  messages: [],
  isSending: false,
  error: null,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

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
