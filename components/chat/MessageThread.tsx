'use client'

import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'

import Avatar from '@/components/ui/Avatar'
import type { ConversationSummary, ChatMessageDTO, ChatUserLite } from '@/lib/chat/types'
import MessageInfoModal from './MessageInfoModal'
import GroupInfoPanel from './GroupInfoPanel'

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

// WhatsApp-style day separator label: Today / Yesterday / weekday / full date.
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayOf = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayMs = 86_400_000
  if (dayOf === startToday) return 'Today'
  if (dayOf === startToday - dayMs) return 'Yesterday'
  if (dayOf > startToday - 7 * dayMs) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

const SKELETON = [
  ['justify-start', '42%'],
  ['justify-end', '55%'],
  ['justify-start', '60%'],
  ['justify-end', '34%'],
  ['justify-start', '48%'],
] as const

export default function MessageThread({
  conversation,
  messages,
  meId,
  loading,
  onSend,
  users,
  onChanged,
  onLeft,
}: {
  conversation: ConversationSummary | null
  messages: ChatMessageDTO[]
  meId: string
  loading: boolean
  onSend: (text: string) => void
  users: ChatUserLite[]
  onChanged: () => void
  onLeft: () => void
}) {
  const [draft, setDraft] = useState('')
  const [infoMsg, setInfoMsg] = useState<ChatMessageDTO | null>(null)
  const [groupInfoOpen, setGroupInfoOpen] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const convoId = conversation?.id

  // Jump to the bottom instantly when switching conversations.
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
    setAtBottom(true)
  }, [convoId])

  // On a new message, follow it only if the reader is already near the bottom
  // (so we don't yank them up while they're reading older messages).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (near) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  function autoGrow() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }

  function send() {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    send()
  }

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

  // Read receipt for one of MY messages: ✓ sent, ✓✓ seen (DMs);
  // "✓✓ N" with a who-saw-it tooltip for groups.
  function receiptFor(msg: ChatMessageDTO) {
    if (!conversation || msg.senderId !== meId) return null
    const others = conversation.members.filter((u) => u.id !== meId)
    if (others.length === 0) return null
    const t = new Date(msg.createdAt).getTime()
    const seenBy = others.filter((u) => u.lastReadAt && new Date(u.lastReadAt).getTime() >= t)
    const seen = seenBy.length > 0
    const label =
      conversation.type === 'GROUP' ? (seen ? `✓✓ ${seenBy.length}` : '✓') : seen ? '✓✓' : '✓'
    return (
      <span
        title={seen ? `Seen by ${seenBy.map((u) => u.name).join(', ')}` : 'Sent'}
        className={seen ? 'text-sky-300' : 'text-white/50'}
      >
        {label}
      </span>
    )
  }

  return (
    <section className="relative flex-1 min-w-0 flex flex-col bg-[#F4F4EE]">
      {/* Header */}
      <div
        className={`h-14 shrink-0 px-4 flex items-center gap-3 border-b border-border-default bg-surface-raised/60 ${conversation.type === 'GROUP' ? 'cursor-pointer hover:bg-surface-raised' : ''}`}
        onClick={conversation.type === 'GROUP' ? () => setGroupInfoOpen(true) : undefined}
        title={conversation.type === 'GROUP' ? 'Group info' : undefined}
      >
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
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="space-y-3 animate-pulse pt-2">
            {SKELETON.map(([side, w], i) => (
              <div key={i} className={`flex ${side}`}>
                <div className="h-9 rounded-2xl bg-black/[0.07]" style={{ width: w }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="font-mono text-xs text-[#999]">No messages yet — say hello 👋</p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const dateSep = !prev || !sameDay(prev.createdAt, m.createdAt) ? (
              <div className="flex justify-center my-2">
                <span className="text-[10px] font-mono uppercase tracking-wide text-text-secondary bg-black/[0.05] rounded-full px-3 py-1">
                  {dayLabel(m.createdAt)}
                </span>
              </div>
            ) : null

            if (m.kind === 'SYSTEM') {
              return (
                <Fragment key={m.id}>
                  {dateSep}
                  <div className="flex justify-center my-1">
                    <span className="text-[11px] text-text-secondary bg-black/[0.05] rounded-full px-3 py-1 text-center">
                      {m.content}
                    </span>
                  </div>
                </Fragment>
              )
            }

            const mine = m.senderId === meId
            const isForgie = m.kind === 'FORGIE'
            return (
              <Fragment key={m.id}>
                {dateSep}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    onContextMenu={mine ? (e) => { e.preventDefault(); setInfoMsg(m) } : undefined}
                    title={mine ? 'Right-click for message info (who’s seen it)' : undefined}
                    className={`max-w-[70%] rounded-2xl px-3 py-2 ${mine ? 'cursor-context-menu ' : ''}${
                      mine
                        ? 'bg-[#3F7A0A] text-white rounded-br-sm'
                        : isForgie
                          ? 'bg-[#EDE7FB] text-[#2A1A4A] rounded-bl-sm'
                          : 'bg-surface-raised text-text-primary rounded-bl-sm border border-border-subtle'
                    }`}
                  >
                    {!mine && conversation.type === 'GROUP' && (
                      <p className="text-[10px] font-mono uppercase tracking-wide opacity-70 mb-0.5">
                        {nameFor(m.senderId)}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                    <div className={`text-[10px] mt-0.5 flex items-center justify-end gap-1 ${mine ? 'text-white/70' : 'text-[#999]'}`}>
                      <span>{timeLabel(m.createdAt)}</span>
                      {mine && receiptFor(m)}
                    </div>
                  </div>
                </div>
              </Fragment>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Jump to latest */}
      {!atBottom && (
        <button
          type="button"
          onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setAtBottom(true) }}
          title="Jump to latest"
          className="absolute right-4 bottom-24 z-10 h-9 w-9 rounded-full bg-surface-raised border border-border-default shadow-md flex items-center justify-center text-text-secondary hover:text-text-primary"
        >
          ↓
        </button>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-border-default bg-surface-raised/60 flex items-end gap-2">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); autoGrow() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={1}
          placeholder="Type a message…  (Shift+Enter for new line)"
          className="flex-1 max-h-[120px] py-2 px-4 rounded-2xl border border-border-default bg-surface-raised text-sm outline-none focus:border-[#3F7A0A] resize-none leading-5"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-10 px-5 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] disabled:opacity-40 transition-colors"
        >
          SEND
        </button>
      </form>

      {infoMsg && (
        <MessageInfoModal
          message={infoMsg}
          conversation={conversation}
          meId={meId}
          onClose={() => setInfoMsg(null)}
        />
      )}

      {groupInfoOpen && conversation.type === 'GROUP' && (
        <GroupInfoPanel
          conversation={conversation}
          meId={meId}
          users={users}
          onClose={() => setGroupInfoOpen(false)}
          onChanged={onChanged}
          onLeft={() => { setGroupInfoOpen(false); onLeft() }}
        />
      )}
    </section>
  )
}
