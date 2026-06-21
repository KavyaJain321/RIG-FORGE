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

function rowToMsg(row: Record<string, unknown>): ChatMessageDTO {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId),
    senderId: row.senderId ? String(row.senderId) : null,
    kind: row.kind as ChatMessageDTO['kind'],
    type: row.type as ChatMessageDTO['type'],
    content: String(row.content),
    replyToId: row.replyToId ? String(row.replyToId) : null,
    deliveredAt: row.deliveredAt ? String(row.deliveredAt) : null,
    createdAt: String(row.createdAt),
  }
}

export default function ChatApp() {
  const me = useAuthStore((s) => s.user)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageDTO[]>([])
  const [users, setUsers] = useState<ChatUserLite[]>([])
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)

  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId
  const meIdRef = useRef<string | null>(null)
  meIdRef.current = me?.id ?? null

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

  // Presence — who's online right now (drives the "online" header state).
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase || !me?.id) return
    const ch = supabase.channel('presence:online', { config: { presence: { key: me.id } } })
    ch.on('presence', { event: 'sync' }, () => {
      setOnlineIds(new Set(Object.keys(ch.presenceState())))
    })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() })
    })
    return () => { void supabase.removeChannel(ch) }
  }, [me?.id])

  // Realtime: new messages, message updates (delivered tick), and read receipts.
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) return
    const channel = supabase
      .channel('rf-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ChatMessage' },
        (payload) => {
          const msg = rowToMsg(payload.new as Record<string, unknown>)
          if (msg.conversationId === activeIdRef.current) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
            void api(`/api/chat/conversations/${msg.conversationId}/read`, { method: 'POST' }).catch(() => {})
          }
          // Ack delivery for messages from someone else (double-grey tick).
          if (msg.senderId && msg.senderId !== meIdRef.current) {
            void api(`/api/chat/messages/${msg.id}/delivered`, { method: 'POST' }).catch(() => {})
          }
          void refreshConversations()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ChatMessage' },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (String(row.conversationId) !== activeIdRef.current) return
          const id = String(row.id)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? { ...m, content: String(row.content), deliveredAt: row.deliveredAt ? String(row.deliveredAt) : null }
                : m,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ConversationMember' },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const conversationId = String(row.conversationId)
          const userId = String(row.userId)
          const lastReadAt = row.lastReadAt ? String(row.lastReadAt) : null
          setConversations((cs) =>
            cs.map((c) =>
              c.id === conversationId
                ? { ...c, members: c.members.map((mm) => (mm.id === userId ? { ...mm, lastReadAt } : mm)) }
                : c,
            ),
          )
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [refreshConversations])

  const handleSend = useCallback(
    async (text: string, replyToId?: string | null) => {
      if (!activeId) return
      try {
        const data = await api<{ message: ChatMessageDTO }>(
          `/api/chat/conversations/${activeId}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text, replyToId: replyToId ?? undefined }),
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

  const handleSendImage = useCallback(
    async (file: File) => {
      if (!activeId) return
      const fd = new FormData()
      fd.append('file', file)
      try {
        const data = await api<{ message: ChatMessageDTO }>(
          `/api/chat/conversations/${activeId}/media`,
          { method: 'POST', body: fd },
        )
        const msg = data.message
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        void refreshConversations()
      } catch (err) {
        console.error('[chat] image', err)
        alert(err instanceof Error ? err.message : 'Image upload failed')
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
        onSendImage={handleSendImage}
        users={users}
        onlineIds={onlineIds}
        onChanged={refreshConversations}
        onLeft={() => { setActiveId(null); void refreshConversations() }}
        onBack={() => setActiveId(null)}
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
