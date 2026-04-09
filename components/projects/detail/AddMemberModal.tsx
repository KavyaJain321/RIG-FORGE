'use client'

import { useState, useEffect } from 'react'

import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import type { ProjectDetail, MemberSummary, ApiResponse, PaginatedResponse } from '@/lib/types'

interface AddMemberModalProps {
  isOpen: boolean
  onClose: () => void
  project: ProjectDetail
  onAdded: (detail: ProjectDetail) => void
}

export default function AddMemberModal({
  isOpen,
  onClose,
  project,
  onAdded,
}: AddMemberModalProps) {
  const [users, setUsers] = useState<MemberSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingIds = new Set(project.members.map((m) => m.userId))

  useEffect(() => {
    if (!isOpen) return
    setSearch('')
    setSelected(new Set())
    setError(null)
    setLoading(true)
    fetch('/api/users?limit=50', { credentials: 'include' })
      .then((r) => r.json())
      .then((json: ApiResponse<PaginatedResponse<MemberSummary>>) => {
        if (json.data) setUsers(json.data.items)
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const available = users.filter((u) => !existingIds.has(u.id))
  const q = search.trim().toLowerCase()
  const filtered = q
    ? available.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
    : available

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAdd() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userIds: Array.from(selected) }),
      })
      const json = (await res.json()) as ApiResponse<ProjectDetail>
      if (res.ok && json.data) {
        onAdded(json.data)
        onClose()
      } else {
        setError(json.error ?? 'Failed to add members')
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-[480px] bg-background-secondary border border-border-default max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-default shrink-0">
            <span className="font-mono text-sm text-primary tracking-widest">ADD MEMBERS </span>
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-muted hover:text-primary transition-colors duration-150"
            >
              ✕
            </button>
          </div>

          <div className="px-6 py-4 flex flex-col flex-1 min-h-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={loading ? 'LOADING...' : 'SEARCH MEMBERS...'}
              disabled={loading}
              className="w-full bg-background-primary border border-border-default px-4 py-3 font-mono text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none transition-colors duration-150 mb-3 shrink-0"
            />
            <div className="flex-1 overflow-y-auto min-h-[200px] border border-border-default border-t-0">
              {filtered.length === 0 ? (
                <p className="font-mono text-xs text-muted px-4 py-6 text-center">
                  {loading ? 'Loading…' : 'No available members'}
                </p>
              ) : (
                filtered.map((u) => {
                  const isSel = selected.has(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={`w-full flex items-center gap-3 py-3 pr-4 border-b border-border-default text-left cursor-pointer transition-colors duration-150 ${
                        isSel
                          ? 'bg-background-tertiary border-l-[3px] border-accent pl-4'
                          : 'hover:bg-background-tertiary border-l-[3px] border-transparent pl-4'
                      }`}
                    >
                      <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                      <span className="font-mono text-sm text-primary flex-1 truncate">
                        {u.name}
                      </span>
                      <Badge label={u.role} variant="role" value={u.role} />
                    </button>
                  )
                })
              )}
            </div>
            {selected.size > 0 && (
              <p className="font-mono text-xs text-accent mt-3 shrink-0">
                {selected.size} MEMBER(S) SELECTED
              </p>
            )}
            {error && (
              <p className="font-mono text-xs text-status-danger mt-2 shrink-0">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-4 px-6 py-4 border-t border-border-default shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-xs text-muted tracking-widest hover:text-primary transition-colors duration-150"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={submitting || selected.size === 0}
              className="bg-accent hover:bg-accent-hover disabled:opacity-60 text-background-primary font-mono text-xs tracking-widest px-6 py-2 transition-colors duration-150"
            >
              {submitting ? 'ADDING...' : 'ADD TO PROJECT'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
