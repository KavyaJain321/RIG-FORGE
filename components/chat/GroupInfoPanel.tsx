'use client'

import { useRef, useState } from 'react'

import Avatar from '@/components/ui/Avatar'
import type { ConversationSummary, ChatUserLite } from '@/lib/chat/types'

async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...opts })
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data as T
}

export default function GroupInfoPanel({
  conversation,
  meId,
  users,
  onClose,
  onChanged,
  onLeft,
}: {
  conversation: ConversationSummary
  meId: string
  users: ChatUserLite[]
  onClose: () => void
  onChanged: () => void
  onLeft: () => void
}) {
  const id = conversation.id
  const myRole = conversation.members.find((m) => m.id === meId)?.role
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN'

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(conversation.title ?? '')
  const [adding, setAdding] = useState(false)
  const [selectedAdd, setSelectedAdd] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descInput, setDescInput] = useState(conversation.description ?? '')
  const [inviteLink, setInviteLink] = useState<string | null>(
    conversation.inviteToken && typeof window !== 'undefined'
      ? `${window.location.origin}/dashboard/messages?join=${conversation.inviteToken}`
      : null,
  )

  const memberIds = new Set(conversation.members.map((m) => m.id))
  const addable = users.filter((u) => !memberIds.has(u.id))

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const patch = (body: object, path = '') =>
    api(`/api/chat/conversations/${id}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  async function saveName() {
    if (!nameInput.trim()) return
    await run(() => patch({ title: nameInput.trim() }))
    setEditingName(false)
  }

  function pickPhoto(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    void run(() => api(`/api/chat/conversations/${id}/image`, { method: 'POST', body: fd }))
  }

  async function addMembers() {
    if (selectedAdd.length === 0) return
    await run(() =>
      api(`/api/chat/conversations/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedAdd }),
      }),
    )
    setAdding(false)
    setSelectedAdd([])
  }

  const removeMember = (userId: string) =>
    run(() =>
      api(`/api/chat/conversations/${id}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    )

  const setRole = (userId: string, role: 'ADMIN' | 'MEMBER') =>
    run(() => patch({ userId, role }, '/members'))

  async function saveDescription() {
    await run(() => patch({ description: descInput.trim() }))
    setEditingDesc(false)
  }

  function toggleOnlyAdmins() {
    void run(() => patch({ onlyAdminsCanSend: !conversation.onlyAdminsCanSend }))
  }

  async function createInviteLink() {
    setBusy(true)
    try {
      const data = await api<{ inviteToken: string | null }>(`/api/chat/conversations/${id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      if (data.inviteToken) setInviteLink(`${window.location.origin}/dashboard/messages?join=${data.inviteToken}`)
      onChanged()
    } catch {
      alert('Failed to create invite link')
    } finally {
      setBusy(false)
    }
  }

  async function revokeInviteLink() {
    setBusy(true)
    try {
      await api(`/api/chat/conversations/${id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      })
      setInviteLink(null)
      onChanged()
    } catch {
      alert('Failed to revoke link')
    } finally {
      setBusy(false)
    }
  }

  function copyInviteLink() {
    if (inviteLink) void navigator.clipboard?.writeText(inviteLink)
  }

  async function leave() {
    if (!confirm('Leave this group?')) return
    setBusy(true)
    try {
      await api(`/api/chat/conversations/${id}/leave`, { method: 'POST' })
      onLeft()
    } catch {
      alert('Failed to leave the group')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] max-h-[85vh] bg-surface-raised rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border-default flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-text-secondary">Group info</span>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Photo + name */}
          <div className="flex flex-col items-center gap-2 py-5 border-b border-border-default">
            <Avatar name={conversation.title ?? '?'} avatarUrl={conversation.avatarUrl} size="lg" />
            {isAdmin && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="font-mono text-[11px] text-[#3F7A0A] hover:underline disabled:opacity-40"
                >
                  Change photo
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) pickPhoto(f)
                    e.target.value = ''
                  }}
                />
              </>
            )}

            {editingName ? (
              <div className="flex items-center gap-2 px-4 w-full justify-center">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-border-default bg-surface-raised text-sm outline-none focus:border-[#3F7A0A]"
                />
                <button type="button" onClick={() => void saveName()} disabled={busy} className="text-[#3F7A0A] text-sm font-mono">SAVE</button>
                <button type="button" onClick={() => { setEditingName(false); setNameInput(conversation.title ?? '') }} className="text-text-secondary text-sm font-mono">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-medium text-text-primary">{conversation.title}</p>
                {isAdmin && (
                  <button type="button" onClick={() => setEditingName(true)} className="text-text-secondary hover:text-text-primary text-sm" title="Edit name">✎</button>
                )}
              </div>
            )}
            <p className="text-[11px] text-text-secondary">{conversation.members.length} members</p>
          </div>

          {/* Description */}
          <div className="px-4 py-3 border-b border-border-default">
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary mb-1">Description</p>
            {editingDesc ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border-default bg-surface-raised text-sm p-2 outline-none focus:border-[#3F7A0A] resize-none"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => void saveDescription()} disabled={busy} className="text-[#3F7A0A] text-xs font-mono">SAVE</button>
                  <button type="button" onClick={() => { setEditingDesc(false); setDescInput(conversation.description ?? '') }} className="text-text-secondary text-xs font-mono">CANCEL</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm text-text-primary whitespace-pre-wrap">
                  {conversation.description || <span className="text-text-secondary italic">No description</span>}
                </p>
                {isAdmin && (
                  <button type="button" onClick={() => setEditingDesc(true)} className="text-text-secondary hover:text-text-primary text-sm" title="Edit description">✎</button>
                )}
              </div>
            )}
          </div>

          {/* Admin settings */}
          {isAdmin && (
            <div className="px-4 py-3 border-b border-border-default space-y-3">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-sm text-text-primary">Only admins can send messages</span>
                <input type="checkbox" checked={!!conversation.onlyAdminsCanSend} onChange={toggleOnlyAdmins} disabled={busy} className="accent-[#3F7A0A]" />
              </label>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary mb-1">Invite link</p>
                {inviteLink ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] text-text-secondary break-all bg-black/[0.04] rounded px-2 py-1">{inviteLink}</p>
                    <div className="flex gap-3">
                      <button type="button" onClick={copyInviteLink} className="text-[#3F7A0A] text-xs font-mono">COPY</button>
                      <button type="button" onClick={() => void revokeInviteLink()} disabled={busy} className="text-status-danger text-xs font-mono">REVOKE</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => void createInviteLink()} disabled={busy} className="text-[#3F7A0A] text-xs font-mono hover:underline">
                    Create invite link
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Members */}
          <div className="py-2">
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                Members
              </span>
              {isAdmin && addable.length > 0 && (
                <button type="button" onClick={() => setAdding((v) => !v)} className="font-mono text-[11px] text-[#3F7A0A] hover:underline">
                  {adding ? 'Cancel' : '＋ Add'}
                </button>
              )}
            </div>

            {adding && (
              <div className="mx-3 mb-2 rounded-xl border border-border-default p-2">
                <div className="max-h-44 overflow-y-auto">
                  {addable.map((u) => (
                    <label key={u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-black/[0.03] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAdd.includes(u.id)}
                        onChange={() => setSelectedAdd((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]))}
                        className="accent-[#3F7A0A]"
                      />
                      <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                      <span className="text-sm text-text-primary">{u.name}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void addMembers()}
                  disabled={selectedAdd.length === 0 || busy}
                  className="mt-2 w-full h-9 rounded-full bg-[#3F7A0A] text-white font-mono text-xs disabled:opacity-40"
                >
                  Add {selectedAdd.length || ''}
                </button>
              </div>
            )}

            {conversation.members.map((m) => {
              const isMe = m.id === meId
              const canManage = isAdmin && !isMe && m.role !== 'OWNER'
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2 hover:bg-black/[0.02]">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{m.name}{isMe ? ' (You)' : ''}</p>
                  </div>
                  {(m.role === 'OWNER' || m.role === 'ADMIN') && (
                    <span className="font-mono text-[9px] uppercase tracking-wide text-[#3F7A0A] border border-[#3F7A0A]/40 rounded px-1.5 py-0.5">
                      {m.role === 'OWNER' ? 'Owner' : 'Admin'}
                    </span>
                  )}
                  {canManage && (
                    <div className="flex items-center gap-1">
                      {m.role === 'ADMIN' ? (
                        <button type="button" disabled={busy} onClick={() => void setRole(m.id, 'MEMBER')} className="text-[10px] font-mono text-text-secondary hover:text-text-primary">Demote</button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void setRole(m.id, 'ADMIN')} className="text-[10px] font-mono text-[#3F7A0A] hover:underline">Make&nbsp;admin</button>
                      )}
                      <button type="button" disabled={busy} onClick={() => void removeMember(m.id)} className="text-[10px] font-mono text-status-danger hover:underline">Remove</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-4 border-t border-border-default">
          <button
            type="button"
            onClick={() => void leave()}
            disabled={busy}
            className="w-full h-10 rounded-full border border-status-danger/40 text-status-danger font-mono text-xs hover:bg-status-danger/10 disabled:opacity-40"
          >
            Leave group
          </button>
        </div>
      </div>
    </div>
  )
}
