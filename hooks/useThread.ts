'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'
import type { LocalMessage, MessageResponse, ThreadType } from '@/components/thread/types'
import type { SendOpts } from '@/components/thread/MessageInput'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ThreadApiData {
  threadId: string | null
  messages: MessageResponse[]
  nextCursor: string | null
  total: number
}

export interface UseThreadReturn {
  messages: LocalMessage[]
  loading: boolean
  error: string | null
  nextCursor: string | null
  sending: boolean
  fetchEarlier: () => Promise<void>
  sendMessage: (content: string, opts?: SendOpts) => Promise<void>
  editMessage: (id: string, content: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  scrollRef: React.RefObject<HTMLDivElement>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPath(threadType: ThreadType, entityId: string): string {
  return `/api/threads/${threadType}/${entityId}`
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useThread(
  threadType: ThreadType,
  entityId: string,
  _projectId: string,
  isAdmin = false,
  isLead = false,
): UseThreadReturn {
  const { user } = useAuthStore()
  const { addToast } = useToast()

  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [sending, setSending]   = useState(false)

  // Refs used inside stable callbacks
  const threadIdRef  = useRef<string | null>(null)
  const messagesRef  = useRef<LocalMessage[]>([])
  const scrollRef    = useRef<HTMLDivElement>(null)

  // Keep messagesRef current for deletion rollback
  useEffect(() => { messagesRef.current = messages }, [messages])

  // ─── Scroll ──────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  // ─── Fetch ───────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(buildPath(threadType, entityId), { credentials: 'include' })
      const json = (await res.json()) as { data: ThreadApiData }
      if (res.ok && json.data) {
        threadIdRef.current = json.data.threadId
        setMessages(json.data.messages)
        setNextCursor(json.data.nextCursor)
        setTimeout(scrollToBottom, 50)
      } else {
        setError('Failed to load thread')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [threadType, entityId, scrollToBottom])

  const fetchEarlier = useCallback(async () => {
    if (!nextCursor) return
    try {
      const url  = `${buildPath(threadType, entityId)}?cursor=${encodeURIComponent(nextCursor)}`
      const res  = await fetch(url, { credentials: 'include' })
      const json = (await res.json()) as { data: ThreadApiData }
      if (res.ok && json.data) {
        setMessages((prev) => [...json.data.messages, ...prev])
        setNextCursor(json.data.nextCursor)
      }
    } catch {
      addToast('error', 'Failed to load earlier messages')
    }
  }, [threadType, entityId, nextCursor, addToast])

  // ─── Send (optimistic) ───────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, opts?: SendOpts) => {
      if (!user) return
      const optimisticId  = `optimistic-${Date.now()}`
      const optimisticMsg: LocalMessage = {
        id:           optimisticId,
        content,
        authorId:     user.id,
        authorName:   user.name,
        authorAvatar: user.avatarUrl,
        threadType,
        threadId:     threadIdRef.current ?? '',
        createdAt:    new Date(),
        updatedAt:    new Date(),
        edited:       false,
        optimistic:   true,
        visibility:   opts?.visibility ?? 'TEAM',
        fileUrl:      opts?.fileUrl,
        fileName:     opts?.fileName,
        fileType:     opts?.fileType,
      }

      setSending(true)
      setMessages((prev) => [...prev, optimisticMsg])
      setTimeout(scrollToBottom, 50)

      try {
        const res  = await fetch(buildPath(threadType, entityId), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            content,
            visibility: opts?.visibility,
            fileUrl:    opts?.fileUrl,
            fileName:   opts?.fileName,
            fileType:   opts?.fileType,
          }),
        })
        const json = (await res.json()) as { data: MessageResponse }
        if (res.ok && json.data) {
          if (!threadIdRef.current) threadIdRef.current = json.data.threadId
          setMessages((prev) => prev.map((m) => (m.id === optimisticId ? json.data : m)))
          setTimeout(scrollToBottom, 50)
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          addToast('error', 'Failed to send message')
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        addToast('error', 'Failed to send message')
      } finally {
        setSending(false)
      }
    },
    [user, threadType, entityId, scrollToBottom, addToast],
  )

  // ─── Edit ────────────────────────────────────────────────────────────

  const editMessage = useCallback(
    async (id: string, content: string) => {
      const prev = messagesRef.current.find((m) => m.id === id)
      if (!prev) return
      setMessages((msgs) =>
        msgs.map((m) => (m.id === id ? { ...m, content, edited: true, updatedAt: new Date() } : m)),
      )
      try {
        const res  = await fetch(`/api/threads/messages/${id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content }),
        })
        const json = (await res.json()) as { data: MessageResponse }
        if (res.ok && json.data) {
          setMessages((msgs) => msgs.map((m) => (m.id === id ? json.data : m)))
        } else {
          setMessages((msgs) => msgs.map((m) => (m.id === id ? prev : m)))
          addToast('error', 'Failed to edit message')
        }
      } catch {
        setMessages((msgs) => msgs.map((m) => (m.id === id ? prev : m)))
        addToast('error', 'Failed to edit message')
      }
    },
    [addToast],
  )

  // ─── Delete ──────────────────────────────────────────────────────────

  const deleteMessage = useCallback(
    async (id: string) => {
      const snapshot = messagesRef.current
      setMessages((prev) => prev.filter((m) => m.id !== id))
      try {
        const res = await fetch(`/api/threads/messages/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) {
          setMessages(snapshot)
          addToast('error', 'Failed to delete message')
        }
      } catch {
        setMessages(snapshot)
        addToast('error', 'Failed to delete message')
      }
    },
    [addToast],
  )

  // ─── Lifecycle ───────────────────────────────────────────────────────

  useEffect(() => { void fetchMessages() }, [fetchMessages])

  // ─── Real-time: forge:new_message window event ───────────────────────

  useEffect(() => {
    function handleNewMessage(e: Event): void {
      const msg = (e as CustomEvent<MessageResponse>).detail
      // Only accept messages for this thread
      if (threadIdRef.current && msg.threadId !== threadIdRef.current) return
      // CHANGE 9: filter out LEAD_ADMIN messages for unauthorized viewers
      if (msg.visibility === 'LEAD_ADMIN' && !isAdmin && !isLead) return
      const nearBottom = isNearBottom()
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      // Capture threadId when thread is first created by someone else
      if (!threadIdRef.current && msg.threadId) {
        threadIdRef.current = msg.threadId
      }
      if (nearBottom) setTimeout(scrollToBottom, 50)
    }

    window.addEventListener('forge:new_message', handleNewMessage)
    return () => window.removeEventListener('forge:new_message', handleNewMessage)
  }, [isNearBottom, scrollToBottom]) // stable refs — minimal deps

  return {
    messages,
    loading,
    error,
    nextCursor,
    sending,
    fetchEarlier,
    sendMessage,
    editMessage,
    deleteMessage,
    scrollRef,
  }
}
