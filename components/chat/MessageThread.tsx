'use client'

import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import Avatar from '@/components/ui/Avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
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
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

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

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5 items-end">
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  )
}

const SKELETON = [
  ['justify-start', '42%'],
  ['justify-end', '55%'],
  ['justify-start', '60%'],
  ['justify-end', '34%'],
  ['justify-start', '48%'],
] as const

type CtxMenu = { msg: ChatMessageDTO; x: number; y: number } | null

export default function MessageThread({
  conversation,
  messages,
  meId,
  loading,
  onSend,
  onSendImage,
  users,
  onlineIds,
  onChanged,
  onLeft,
  onBack,
}: {
  conversation: ConversationSummary | null
  messages: ChatMessageDTO[]
  meId: string
  loading: boolean
  onSend: (text: string, replyToId?: string | null) => void
  onSendImage: (file: File) => void
  users: ChatUserLite[]
  onlineIds: Set<string>
  onChanged: () => void
  onLeft: () => void
  onBack: () => void
}) {
  const [draft, setDraft] = useState('')
  const [infoMsg, setInfoMsg] = useState<ChatMessageDTO | null>(null)
  const [groupInfoOpen, setGroupInfoOpen] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [typingName, setTypingName] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<ChatMessageDTO | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef(0)

  const convoId = conversation?.id

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
    setAtBottom(true)
  }, [convoId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (near) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Typing indicator over a per-conversation Supabase Broadcast channel.
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase || !convoId) return
    const ch = supabase.channel(`typing:${convoId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'typing' }, (p) => {
      const { userId, name } = (p.payload ?? {}) as { userId?: string; name?: string }
      if (!userId || userId === meId) return
      setTypingName(name || 'Someone')
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => setTypingName(null), 3500)
    })
    ch.subscribe()
    typingChannelRef.current = ch
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      setTypingName(null)
      void supabase.removeChannel(ch)
      typingChannelRef.current = null
    }
  }, [convoId, meId])

  function broadcastTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 1500) return
    lastTypingSentRef.current = now
    const myName = conversation?.members.find((u) => u.id === meId)?.name ?? 'Someone'
    void typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: meId, name: myName },
    })
  }

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
    onSend(text, replyingTo?.id ?? null)
    setDraft('')
    setReplyingTo(null)
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    send()
  }

  if (!conversation) {
    return (
      <section className="hidden md:flex flex-1 min-w-0 items-center justify-center bg-[#F4F4EE]">
        <p className="font-mono text-sm text-[#999]">Select a conversation to start chatting</p>
      </section>
    )
  }

  function nameFor(senderId: string | null): string {
    if (!senderId) return 'Forgie'
    const m = conversation?.members.find((u) => u.id === senderId)
    return m?.name ?? 'Someone'
  }

  // 3-state receipt for MY messages: ✓ sent · ✓✓ grey delivered · ✓✓ blue read.
  function receiptFor(msg: ChatMessageDTO) {
    if (!conversation || msg.senderId !== meId) return null
    const others = conversation.members.filter((u) => u.id !== meId)
    if (others.length === 0) return null
    const t = new Date(msg.createdAt).getTime()
    const seenBy = others.filter((u) => u.lastReadAt && new Date(u.lastReadAt).getTime() >= t)
    if (seenBy.length > 0) {
      const label = conversation.type === 'GROUP' ? `✓✓ ${seenBy.length}` : '✓✓'
      return <span title={`Read by ${seenBy.map((u) => u.name).join(', ')}`} className="text-sky-300">{label}</span>
    }
    if (msg.deliveredAt) return <span title="Delivered" className="text-white/60">✓✓</span>
    return <span title="Sent" className="text-white/50">✓</span>
  }

  const others = conversation.members.filter((u) => u.id !== meId)
  const dmOther = conversation.type === 'DIRECT' ? others[0] : null
  const dmOnline = dmOther ? onlineIds.has(dmOther.id) : false
  const groupOnline = conversation.type === 'GROUP' ? others.filter((u) => onlineIds.has(u.id)).length : 0

  return (
    <section className="relative flex-1 min-w-0 flex flex-col bg-[#F4F4EE]">
      {/* Header */}
      <div
        className={`h-14 shrink-0 px-3 sm:px-4 flex items-center gap-2 sm:gap-3 border-b border-border-default bg-surface-raised/60 ${conversation.type === 'GROUP' ? 'cursor-pointer hover:bg-surface-raised' : ''}`}
        onClick={conversation.type === 'GROUP' ? () => setGroupInfoOpen(true) : undefined}
        title={conversation.type === 'GROUP' ? 'Group info' : undefined}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onBack() }}
          className="md:hidden text-text-secondary hover:text-text-primary text-lg leading-none"
          title="Back"
        >
          ‹
        </button>
        <Avatar name={conversation.title ?? '?'} avatarUrl={conversation.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-sm text-text-primary truncate">
            {conversation.type === 'GROUP' ? '# ' : ''}{conversation.title}
          </p>
          {typingName ? (
            <span className="text-[11px] text-[#3F7A0A] flex items-center gap-1">
              {conversation.type === 'GROUP' ? `${typingName} is ` : ''}typing <TypingDots />
            </span>
          ) : conversation.type === 'GROUP' ? (
            <p className="text-[11px] text-[#888] truncate">
              {conversation.members.length} members{groupOnline > 0 ? ` · ${groupOnline} online` : ''}
            </p>
          ) : dmOnline ? (
            <p className="text-[11px] text-[#3F7A0A]">online</p>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2">
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
            const quoted = m.replyToId ? messages.find((x) => x.id === m.replyToId) : null
            return (
              <Fragment key={m.id}>
                {dateSep}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ msg: m, x: e.clientX, y: e.clientY }) }}
                    className={`max-w-[78%] sm:max-w-[70%] rounded-2xl px-3 py-2 cursor-context-menu ${
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
                    {m.replyToId && (
                      <div className={`mb-1 rounded px-2 py-1 border-l-2 text-xs ${mine ? 'border-white/60 bg-black/10 text-white/80' : 'border-[#3F7A0A] bg-black/[0.05] text-text-secondary'}`}>
                        <span className="block font-medium">
                          {quoted ? (quoted.senderId === meId ? 'You' : nameFor(quoted.senderId)) : 'Message'}
                        </span>
                        <span className="block truncate">
                          {quoted ? (quoted.type === 'IMAGE' ? '📷 Photo' : quoted.content) : '…'}
                        </span>
                      </div>
                    )}
                    {m.type === 'IMAGE' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.content} alt="" className="rounded-lg max-w-full max-h-72 object-cover" />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                    )}
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

      {/* Composer (with reply preview) */}
      <div className="shrink-0 border-t border-border-default bg-surface-raised/60">
        {replyingTo && (
          <div className="px-3 pt-2 flex items-start gap-2">
            <div className="flex-1 min-w-0 border-l-2 border-[#3F7A0A] bg-black/[0.04] rounded px-2 py-1">
              <p className="text-[11px] text-[#3F7A0A] font-medium">
                {replyingTo.senderId === meId ? 'You' : nameFor(replyingTo.senderId)}
              </p>
              <p className="text-xs text-text-secondary truncate">
                {replyingTo.type === 'IMAGE' ? '📷 Photo' : replyingTo.content}
              </p>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} className="text-text-secondary hover:text-text-primary">✕</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="p-3 flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Send image"
            className="h-10 w-10 shrink-0 rounded-full border border-border-default flex items-center justify-center text-text-secondary hover:text-text-primary"
          >
            📷
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onSendImage(f); e.target.value = '' }}
          />
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim()) broadcastTyping(); autoGrow() }}
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
      </div>

      {/* Right-click / long-press context menu */}
      {ctxMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}>
          <div
            className="absolute min-w-[150px] bg-surface-raised border border-border-default rounded-lg shadow-lg py-1"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => { setReplyingTo(ctxMenu.msg); setCtxMenu(null) }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-black/[0.05]">↩ Reply</button>
            {ctxMenu.msg.type !== 'IMAGE' && (
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(ctxMenu.msg.content); setCtxMenu(null) }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-black/[0.05]">⧉ Copy</button>
            )}
            {ctxMenu.msg.senderId === meId && (
              <button type="button" onClick={() => { setInfoMsg(ctxMenu.msg); setCtxMenu(null) }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-black/[0.05]">ⓘ Info</button>
            )}
          </div>
        </div>
      )}

      {infoMsg && (
        <MessageInfoModal message={infoMsg} conversation={conversation} meId={meId} onClose={() => setInfoMsg(null)} />
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
