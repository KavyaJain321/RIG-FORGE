'use client'

import { useState } from 'react'

import Avatar from '@/components/ui/Avatar'
import NotificationToggle from './NotificationToggle'
import type { ConversationSummary } from '@/lib/chat/types'

function preview(c: ConversationSummary): string {
  if (!c.lastMessage) return 'No messages yet'
  const prefix = c.lastMessage.kind === 'FORGIE' ? 'Forgie: ' : ''
  return prefix + c.lastMessage.content
}

function compactTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayOf = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayMs = 86_400_000
  if (dayOf === startToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (dayOf === startToday - dayMs) return 'Yesterday'
  if (dayOf > startToday - 7 * dayMs) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

function SkeletonRow() {
  return (
    <div className="px-3 py-2.5 flex items-center gap-3 animate-pulse">
      <div className="h-9 w-9 rounded-full bg-black/[0.08] shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/2 rounded bg-black/[0.08]" />
        <div className="h-2.5 w-3/4 rounded bg-black/[0.06]" />
      </div>
    </div>
  )
}

type ChatMenu = { conv: ConversationSummary; x: number; y: number } | null
type ChatFlags = { archived?: boolean; pinned?: boolean; muteHours?: number | null; cleared?: boolean }

export default function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onNewChat,
  onOpenStarred,
  onChatSettings,
  meId,
  onBlockUser,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onNewChat: () => void
  onOpenStarred: () => void
  onChatSettings: (conversationId: string, flags: ChatFlags) => void
  meId: string
  onBlockUser: (otherUserId: string, block: boolean) => void
}) {
  const [chatMenu, setChatMenu] = useState<ChatMenu>(null)
  const [showArchived, setShowArchived] = useState(false)

  const sorted = [...conversations].sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    return bt - at
  })
  const activeChats = sorted.filter((c) => !c.isArchived)
  const archivedChats = sorted.filter((c) => c.isArchived)

  function openMenu(e: React.MouseEvent, c: ConversationSummary) {
    e.preventDefault()
    const MW = 170
    const MH = 200
    const x = e.clientX + MW > window.innerWidth ? Math.max(8, window.innerWidth - MW - 8) : e.clientX
    const y = e.clientY + MH > window.innerHeight ? Math.max(8, window.innerHeight - MH - 8) : e.clientY
    setChatMenu({ conv: c, x, y })
  }

  const renderRow = (c: ConversationSummary) => {
    const active = c.id === activeId
    const time = compactTime(c.lastMessageAt ?? c.lastMessage?.createdAt ?? null)
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => onSelect(c.id)}
        onContextMenu={(e) => openMenu(e, c)}
        className={[
          'w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-black/[0.05] transition-colors',
          active ? 'bg-[#3F7A0A]/10' : 'hover:bg-black/[0.03]',
        ].join(' ')}
      >
        {c.isForgie ? (
          <div className="h-9 w-9 shrink-0 rounded-full bg-[#EDE7FB] flex items-center justify-center text-base">🤖</div>
        ) : (
          <Avatar name={c.title ?? '?'} avatarUrl={c.avatarUrl} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm text-text-primary truncate">
              {c.isPinned ? '📌 ' : ''}{c.type === 'GROUP' ? '# ' : ''}{c.title}
            </span>
            <span className={`shrink-0 text-[10px] ${c.unread > 0 ? 'text-[#3F7A0A] font-medium' : 'text-text-secondary'}`}>
              {time}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {(() => {
              const d = typeof window !== 'undefined' ? localStorage.getItem(`rf-chat-draft-${c.id}`) || '' : ''
              return d ? (
                <p className="text-xs truncate"><span className="text-status-danger">Draft: </span><span className="text-[#777]">{d}</span></p>
              ) : (
                <p className="text-xs text-[#777] truncate">{preview(c)}</p>
              )
            })()}
            <span className="flex items-center gap-1 shrink-0">
              {c.muted && <span title="Muted" className="text-[10px]">🔇</span>}
              {c.unread > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3F7A0A] text-white text-[10px] font-mono flex items-center justify-center">
                  {c.unread}
                </span>
              )}
            </span>
          </div>
        </div>
      </button>
    )
  }

  const menuBtn = 'w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-black/[0.05]'

  return (
    <aside className={`w-full md:w-72 shrink-0 border-r border-border-default bg-surface-raised/60 flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}>
      <div className="h-14 px-4 flex items-center justify-between border-b border-border-default">
        <span className="font-mono text-xs uppercase tracking-widest text-text-secondary">Messages</span>
        <div className="flex items-center gap-2">
          <NotificationToggle />
          <button type="button" onClick={onOpenStarred} title="Starred messages" className="text-text-secondary hover:text-text-primary">
            ⭐
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className="h-8 px-3 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] transition-colors"
          >
            ＋ New
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>{Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}</>
        ) : conversations.length === 0 ? (
          <p className="p-4 font-mono text-xs text-[#888]">
            No conversations yet. Tap <span className="text-[#3F7A0A]">＋ New</span> to start one.
          </p>
        ) : (
          <>
            {activeChats.map(renderRow)}
            {archivedChats.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowArchived((s) => !s)}
                  className="w-full text-left px-3 py-2 text-[11px] font-mono uppercase tracking-wide text-text-secondary border-b border-black/[0.05] hover:bg-black/[0.03]"
                >
                  🗄 Archived ({archivedChats.length}) {showArchived ? '▾' : '▸'}
                </button>
                {showArchived && archivedChats.map(renderRow)}
              </>
            )}
          </>
        )}
      </div>

      {chatMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setChatMenu(null)} onContextMenu={(e) => { e.preventDefault(); setChatMenu(null) }}>
          <div
            className="absolute min-w-[160px] bg-surface-raised border border-border-default rounded-lg shadow-lg py-1"
            style={{ top: chatMenu.y, left: chatMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className={menuBtn} onClick={() => { onChatSettings(chatMenu.conv.id, { pinned: !chatMenu.conv.isPinned }); setChatMenu(null) }}>
              {chatMenu.conv.isPinned ? '📌 Unpin chat' : '📌 Pin chat'}
            </button>
            <button type="button" className={menuBtn} onClick={() => { onChatSettings(chatMenu.conv.id, { muteHours: chatMenu.conv.muted ? 0 : 87600 }); setChatMenu(null) }}>
              {chatMenu.conv.muted ? '🔔 Unmute' : '🔇 Mute'}
            </button>
            <button type="button" className={menuBtn} onClick={() => { onChatSettings(chatMenu.conv.id, { archived: !chatMenu.conv.isArchived }); setChatMenu(null) }}>
              {chatMenu.conv.isArchived ? '📥 Unarchive' : '🗄 Archive'}
            </button>
            {chatMenu.conv.type === 'DIRECT' && (() => {
              const other = chatMenu.conv.members.find((mm) => mm.id !== meId)
              if (!other) return null
              return (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-status-danger hover:bg-black/[0.05]"
                  onClick={() => { onBlockUser(other.id, !chatMenu.conv.blocked); setChatMenu(null) }}
                >
                  {chatMenu.conv.blocked ? '✅ Unblock' : '🚫 Block'}
                </button>
              )
            })()}
            <button type="button" className="w-full text-left px-3 py-2 text-sm text-status-danger hover:bg-black/[0.05]" onClick={() => { const id = chatMenu.conv.id; setChatMenu(null); if (confirm('Clear all messages in this chat for you?')) onChatSettings(id, { cleared: true }) }}>
              🧹 Clear chat
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
