'use client'

import { useState } from 'react'

import Avatar from '@/components/ui/Avatar'
import type { ChatUserLite } from '@/lib/chat/types'

export default function NewChatModal({
  users,
  onClose,
  onStartDm,
  onCreateGroup,
}: {
  users: ChatUserLite[]
  onClose: () => void
  onStartDm: (userId: string) => void
  onCreateGroup: (title: string, memberIds: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')

  const isGroup = selected.length >= 2
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  function submit() {
    if (selected.length === 0) return
    if (isGroup) {
      if (!groupName.trim()) return
      onCreateGroup(groupName.trim(), selected)
    } else {
      onStartDm(selected[0])
    }
  }

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
            New message
          </span>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {users.length === 0 ? (
            <p className="p-3 text-xs text-text-muted">No teammates found.</p>
          ) : (
            users.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-text-primary//[0.03] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(u.id)}
                  onChange={() => toggle(u.id)}
                  className="accent-[#3F7A0A]"
                />
                <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <span className="text-sm text-text-primary">{u.name}</span>
              </label>
            ))
          )}
        </div>

        {isGroup && (
          <div className="px-4 pt-2">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name…"
              className="w-full h-10 px-3 rounded-lg border border-border-default text-sm outline-none focus:border-accent-ink"
            />
          </div>
        )}

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
            onClick={submit}
            disabled={selected.length === 0 || (isGroup && !groupName.trim())}
            className="h-10 px-5 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] disabled:opacity-40 transition-colors"
          >
            {isGroup ? 'CREATE GROUP' : 'START CHAT'}
          </button>
        </div>
      </div>
    </div>
  )
}
