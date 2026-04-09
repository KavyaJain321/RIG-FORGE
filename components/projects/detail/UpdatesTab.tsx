'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MessageResponse, ApiResponse } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdatesTabProps {
  projectId: string
  currentUser: {
    id: string
    name: string
    role: string
  }
  isLead: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Replace bare URLs with anchor tags. Returns an array of text/element nodes. */
function linkify(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/\S+/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const url = match[0]
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline underline-offset-2 hover:text-accent/80 break-all"
      >
        {url}
      </a>,
    )
    lastIndex = match.index + url.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: MessageResponse
  isOwn: boolean
  isLead: boolean
}

function MessageBubble({ message, isOwn, isLead }: MessageBubbleProps) {
  const initials = getInitials(message.authorName)

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className="shrink-0">
        {message.authorAvatar ? (
          <img
            src={message.authorAvatar}
            alt={message.authorName}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold select-none">
            {initials}
          </span>
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[70%] space-y-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Author line */}
        <div className={`flex items-center gap-1.5 text-xs ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="font-medium text-foreground">{message.authorName}</span>
          {(message.authorRole ?? '') === 'ADMIN' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-900/40 text-amber-400">
              Admin
            </span>
          )}
          {isLead && (message.authorRole ?? '') !== 'ADMIN' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-900/40 text-blue-400">
              Lead
            </span>
          )}
          <span className="text-muted">{formatTime(message.createdAt)}</span>
          {message.edited && <span className="text-muted italic">(edited)</span>}
        </div>

        {/* Text */}
        <div
          className={[
            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
            isOwn
              ? 'bg-blue-950 text-blue-100 rounded-tr-none'
              : 'bg-gray-800 text-foreground rounded-tl-none',
          ].join(' ')}
        >
          {linkify(message.content)}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UpdatesTab({ projectId, currentUser, isLead }: UpdatesTabProps) {
  const [messages, setMessages] = useState<MessageResponse[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [draft, setDraft]       = useState('')
  const [sending, setSending]   = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/threads/project/${projectId}?limit=100`,
        { credentials: 'include' },
      )
      const json = await res.json() as ApiResponse<{ messages: MessageResponse[] }>
      if (!res.ok || json.error) {
        if (!silent) setError(json.error ?? 'Failed to load updates.')
        return
      }
      setMessages(json.data?.messages ?? [])
    } catch {
      if (!silent) setError('Network error loading updates.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId])

  // Initial load + polling
  useEffect(() => {
    void fetchMessages(false)

    pollRef.current = setInterval(() => {
      void fetchMessages(true)
    }, 15_000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchMessages])

  // Scroll to bottom when messages load
  useEffect(() => {
    if (!loading) scrollToBottom()
  }, [loading, messages.length])

  async function handleSend() {
    const content = draft.trim()
    if (!content || sending) return

    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/threads/project/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      })
      const json = await res.json() as ApiResponse<MessageResponse>
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to send message.')
        return
      }
      if (json.data) {
        setMessages((prev) => [...prev, json.data!])
      }
      setDraft('')
      setTimeout(scrollToBottom, 50)
    } catch {
      setError('Network error. Message not sent.')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-[500px]">

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2 shrink-0">
          {error}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-raised animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-surface-raised rounded animate-pulse" />
                  <div className="h-10 w-64 bg-surface-raised rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted">
            No updates yet. Be the first to post!
          </div>
        )}

        {!loading && messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.authorId === currentUser.id}
            isLead={isLead && msg.authorId === currentUser.id}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border-default px-4 py-3 flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          placeholder="Write an update… (Enter to send, Shift+Enter for newline)"
          className="flex-1 bg-surface-raised border border-border-default rounded px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !draft.trim()}
          className="px-4 py-2 text-sm font-medium bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50 transition-colors self-end"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
