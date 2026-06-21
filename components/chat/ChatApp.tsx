'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuthStore } from '@/store/authStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import type {
  ConversationSummary,
  ChatMessageDTO,
  ChatUserLite,
} from '@/lib/chat/types'
import ConversationList from './ConversationList'
import MessageThread from './MessageThread'
import NewChatModal from './NewChatModal'

// Thin fetch wrapper for our { data, error } envelope.
async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...opts })
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data as T
}

export default function ChatApp() {
  const me = useAuthStore((s) => s.user)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageDTO[]>([])
  const [users, setUsers] = useState<ChatUserLite[]>([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)

  // Ref so the realtime callback always sees the currently-open conversation.
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

  const refreshConversations = useCallback(async () => {
    try {
      const data = await api<{ conversations: ConversationSummary[] }>('/api/chat/conversations')
      setConversations(data.conversations)
    } catch (err) {
      console.error('[chat] load conversations', err)
    } finally {
      setLoadingConvos(false)
    }
  }, [])

  useEffect(() => { void refreshConversations() }, [refreshConversations])

  // Roster for the new-chat picker (once).
  useEffect(() => {
    void api<{ users: ChatUserLite[] }>('/api/chat/users')
      .then((d) => setUsers(d.users))
      .catch(() => {})
  }, [])

  // Load messages + mark read whenever the active conversation changes.
  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    let cancelled = false
    setLoadingMsgs(true)
    void api<{ messages: ChatMessageDTO[] }>(`/api/chat/conversations/${activeId}/messages`)
      .then((d) => { if (!cancelled) setMessages(d.messages) })
      .catch((err) => console.error('[chat] load messages', err))
      .finally(() => { if (!cancelled) setLoadingMsgs(false) })

    void api(`/api/chat/conversations/${activeId}/read`, { method: 'POST' }).catch(() => {})
    setConversations((cs) => cs.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)))

    return () => { cancelled = true }
  }, [activeId])

  // Realtime: one channel for ALL new chat messages. Append to the open thread
  // and refresh the conversation list (last message / unread / order).
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) return
    const channel = supabase
      .channel('rf-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ChatMessage' },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const msg: ChatMessageDTO = {
            id: String(row.id),
            conversationId: String(row.conversationId),
            senderId: row.senderId ? String(row.senderId) : null,
            kind: row.kind as ChatMessageDTO['kind'],
            type: row.type as ChatMessageDTO['type'],
            content: String(row.content),
            createdAt: String(row.createdAt),
          }
          if (msg.conversationId === activeIdRef.current) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
            void api(`/api/chat/conversations/${msg.conversationId}/read`, { method: 'POST' }).catch(() => {})
          }
          void refreshConversations()
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [refreshConversations])

  const handleSend = useCallback(
    async (text: string) => {
      if (!activeId) return
      try {
        const data = await api<{ message: ChatMessageDTO }>(
          `/api/chat/conversations/${activeId}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
          },
        )
        const msg = data.message
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        void refreshConversations()
      } catch (err) {
        console.error('[chat] send', err)
      }
    },
    [activeId, refreshConversations],
  )

  const openConversation = useCallback(
    async (payload: object) => {
      const data = await api<{ conversation: { id: string } }>('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setNewChatOpen(false)
      await refreshConversations()
      setActiveId(data.conversation.id)
    },
    [refreshConversations],
  )

  const handleStartDm = useCallback(
    (userId: string) => { void openConversation({ type: 'DIRECT', userId }) },
    [openConversation],
  )
  const handleCreateGroup = useCallback(
    (title: string, memberIds: string[]) => { void openConversation({ type: 'GROUP', title, memberIds }) },
    [openConversation],
  )

  const active = conversations.find((c) => c.id === activeId) ?? null

  if (!me) {
    return <div className="p-8 font-mono text-sm text-text-secondary">Loading…</div>
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        loading={loadingConvos}
        onSelect={setActiveId}
        onNewChat={() => setNewChatOpen(true)}
      />
      <MessageThread
        conversation={active}
        messages={messages}
        meId={me.id}
        loading={loadingMsgs}
        onSend={handleSend}
      />
      {newChatOpen && (
        <NewChatModal
          users={users}
          onClose={() => setNewChatOpen(false)}
          onStartDm={handleStartDm}
          onCreateGroup={handleCreateGroup}
        />
      )}
    </div>
  )
}
