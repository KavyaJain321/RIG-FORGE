'use client'

import Avatar from '@/components/ui/Avatar'
import type { ConversationSummary, ChatMessageDTO, ChatMember } from '@/lib/chat/types'

function fmt(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString([], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function Row({ member, showTime }: { member: ChatMember; showTime?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Avatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
      <span className="flex-1 text-sm text-text-primary">{member.name}</span>
      {showTime && member.lastReadAt && (
        <span className="text-[11px] text-text-secondary">{fmt(member.lastReadAt)}</span>
      )}
    </div>
  )
}

// WhatsApp-style "Message Info": who's read this message and who hasn't yet.
// Read state is derived from each member's lastReadAt vs the message time.
export default function MessageInfoModal({
  message,
  conversation,
  meId,
  onClose,
}: {
  message: ChatMessageDTO
  conversation: ConversationSummary
  meId: string
  onClose: () => void
}) {
  const others = conversation.members.filter((u) => u.id !== meId)
  const t = new Date(message.createdAt).getTime()
  const readBy = others.filter((u) => u.lastReadAt && new Date(u.lastReadAt).getTime() >= t)
  const pending = others.filter((u) => !(u.lastReadAt && new Date(u.lastReadAt).getTime() >= t))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] max-h-[80vh] bg-surface-raised rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border-default flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-text-secondary">
            Message info
          </span>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary">
            ✕
          </button>
        </div>

        {/* The message itself */}
        <div className="px-4 py-3 border-b border-border-default">
          <div className="inline-block max-w-full rounded-2xl rounded-br-sm bg-[#3F7A0A] text-white px-3 py-2">
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            <p className="text-[10px] text-white/70 mt-0.5 text-right">{fmt(message.createdAt)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            <span className="text-sky-500">✓✓</span> Read by {readBy.length}
            {conversation.type === 'GROUP' ? ` / ${others.length}` : ''}
          </p>
          {readBy.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-secondary">No one yet</p>
          ) : (
            readBy.map((u) => <Row key={u.id} member={u} showTime />)
          )}

          {pending.length > 0 && (
            <>
              <p className="px-3 py-1 mt-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                ✓ Delivered · waiting {pending.length}
              </p>
              {pending.map((u) => (
                <Row key={u.id} member={u} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
