'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

import Avatar from '@/components/ui/Avatar'
import type { ConversationSummary, ChatMessageDTO } from '@/lib/chat/types'

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function MessageThread({
  conversation,
  messages,
  meId,
  loading,
  onSend,
}: {
  conversation: ConversationSummary | null
  messages: ChatMessageDTO[]
  meId: string
  loading: boolean
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (!conversation) {
    return (
      <section className="flex-1 min-w-0 flex items-center justify-center bg-[#F4F4EE]">
        <p className="font-mono text-sm text-[#999]">Select a conversation to start chatting</p>
      </section>
    )
  }

  function nameFor(senderId: string | null): string {
    if (!senderId) return 'Forgie'
    const m = conversation?.members.find((u) => u.id === senderId)
    return m?.name ?? 'Someone'
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-[#F4F4EE]">
      {/* Header */}
      <div className="h-14 shrink-0 px-4 flex items-center gap-3 border-b border-border-default bg-surface-raised/60">
        <Avatar name={conversation.title ?? '?'} avatarUrl={conversation.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-sm text-text-primary truncate">
            {conversation.type === 'GROUP' ? '# ' : ''}{conversation.title}
          </p>
          {conversation.type === 'GROUP' && (
            <p className="text-[11px] text-[#888] truncate">
              {conversation.members.length} members
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <p className="font-mono text-xs text-[#999]">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="font-mono text-xs text-[#999]">No messages yet — say hello 👋</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === meId
            const isForgie = m.kind === 'FORGIE'
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-3 py-2 ${
                  mine
                    ? 'bg-[#3F7A0A] text-white rounded-br-sm'
                    : isForgie
                      ? 'bg-[#EDE7FB] text-[#2A1A4A] rounded-bl-sm'
                      : 'bg-surface-raised text-text-primary rounded-bl-sm border border-border-subtle'
                }`}>
                  {!mine && conversation.type === 'GROUP' && (
                    <p className="text-[10px] font-mono uppercase tracking-wide opacity-70 mb-0.5">
                      {nameFor(m.senderId)}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/70' : 'text-[#999]'}`}>
                    {timeLabel(m.createdAt)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-border-default bg-surface-raised/60 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 h-10 px-4 rounded-full border border-border-default bg-surface-raised text-sm outline-none focus:border-[#3F7A0A]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-10 px-5 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] disabled:opacity-40 transition-colors"
        >
          SEND
        </button>
      </form>
    </section>
  )
}
