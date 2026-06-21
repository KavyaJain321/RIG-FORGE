'use client'

import Avatar from '@/components/ui/Avatar'
import type { ConversationSummary } from '@/lib/chat/types'

function preview(c: ConversationSummary): string {
  if (!c.lastMessage) return 'No messages yet'
  const prefix = c.lastMessage.kind === 'FORGIE' ? 'Forgie: ' : ''
  return prefix + c.lastMessage.content
}

// WhatsApp-style row time: today → HH:MM, yesterday → "Yesterday",
// this week → weekday, older → date.
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

export default function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onNewChat,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onNewChat: () => void
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-border-default bg-surface-raised/60 flex flex-col">
      <div className="h-14 px-4 flex items-center justify-between border-b border-border-default">
        <span className="font-mono text-xs uppercase tracking-widest text-text-secondary">Messages</span>
        <button
          type="button"
          onClick={onNewChat}
          className="h-8 px-3 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] transition-colors"
        >
          ＋ New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>{Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}</>
        ) : conversations.length === 0 ? (
          <p className="p-4 font-mono text-xs text-[#888]">
            No conversations yet. Tap <span className="text-[#3F7A0A]">＋ New</span> to start one.
          </p>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeId
            const time = compactTime(c.lastMessageAt ?? c.lastMessage?.createdAt ?? null)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={[
                  'w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-black/[0.05] transition-colors',
                  active ? 'bg-[#3F7A0A]/10' : 'hover:bg-black/[0.03]',
                ].join(' ')}
              >
                <Avatar name={c.title ?? '?'} avatarUrl={c.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-text-primary truncate">
                      {c.type === 'GROUP' ? '# ' : ''}{c.title}
                    </span>
                    <span className={`shrink-0 text-[10px] ${c.unread > 0 ? 'text-[#3F7A0A] font-medium' : 'text-text-secondary'}`}>
                      {time}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-[#777] truncate">{preview(c)}</p>
                    {c.unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#3F7A0A] text-white text-[10px] font-mono flex items-center justify-center">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
