'use client'

import Avatar from '@/components/ui/Avatar'
import type { ConversationSummary } from '@/lib/chat/types'

function preview(c: ConversationSummary): string {
  if (!c.lastMessage) return 'No messages yet'
  const prefix = c.lastMessage.kind === 'FORGIE' ? 'Forgie: ' : ''
  return prefix + c.lastMessage.content
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
          <p className="p-4 font-mono text-xs text-[#888]">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="p-4 font-mono text-xs text-[#888]">
            No conversations yet. Tap <span className="text-[#3F7A0A]">＋ New</span> to start one.
          </p>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeId
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
                    {c.unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#3F7A0A] text-white text-[10px] font-mono flex items-center justify-center">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#777] truncate">{preview(c)}</p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
