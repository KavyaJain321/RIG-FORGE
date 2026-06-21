'use client'

import { useState } from 'react'

import Avatar from '@/components/ui/Avatar'
import type { ConversationSummary } from '@/lib/chat/types'

export default function ForwardModal({
  conversations,
  preview,
  onClose,
  onForward,
}: {
  conversations: ConversationSummary[]
  preview: string
  onClose: () => void
  onForward: (targetIds: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[420px] max-h-[80vh] bg-surface-raised rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border-default flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-text-secondary">Forward to…</span>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary">✕</button>
        </div>
        <div className="px-4 py-2 border-b border-border-default">
          <p className="text-xs text-text-secondary truncate">↪ {preview}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="p-3 text-xs text-text-secondary">No chats to forward to.</p>
          ) : (
            conversations.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-text-primary//[0.03] cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  className="accent-[#3F7A0A]"
                />
                <Avatar name={c.title ?? '?'} avatarUrl={c.avatarUrl} size="sm" />
                <span className="text-sm text-text-primary truncate">
                  {c.type === 'GROUP' ? '# ' : ''}{c.title}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="p-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-full border border-border-default font-mono text-xs text-text-secondary hover:bg-text-primary//[0.03]"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={() => onForward(selected)}
            disabled={selected.length === 0}
            className="h-10 px-5 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] disabled:opacity-40"
          >
            FORWARD {selected.length || ''}
          </button>
        </div>
      </div>
    </div>
  )
}
