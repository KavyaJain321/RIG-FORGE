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
