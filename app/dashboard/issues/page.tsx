'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { userCan } from '@/lib/permissions'

interface IssueItem {
  id: string
  title: string
  description: string
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED'
  pageUrl: string | null
  imageUrl: string | null
  userAgent: string | null
  createdAt: string
  reporter: { id: string; name: string; email: string; avatarUrl: string | null }
}

const STATUSES: IssueItem['status'][] = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED']

const STATUS_CLASS: Record<IssueItem['status'], string> = {
  OPEN: 'border-accent/50 text-accent-ink',
  IN_REVIEW: 'border-amber-500/50 text-amber-600',
  RESOLVED: 'border-emerald-500/50 text-emerald-600',
  CLOSED: 'border-border-default text-text-muted',
}

function fmt(d: string): string {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function IssuesPage() {
  const { user } = useAuthStore()
  const isAdmin = userCan(user, 'members.view')

  const [items, setItems] = useState<IssueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/issues', { credentials: 'include' })
      const json = (await res.json()) as { data: { items: IssueItem[] } | null; error: string | null }
      if (!res.ok || !json.data) { setError(json.error ?? 'Failed to load issues'); return }
      setItems(json.data.items)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isAdmin) void load() }, [isAdmin, load])

  async function updateStatus(id: string, status: IssueItem['status']) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
    await fetch(`/api/issues/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => void load())
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <p className="font-mono text-xs text-text-muted">Admin access required.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-mono text-sm tracking-widest uppercase text-text-primary">Reported Issues</h1>
        <button type="button" onClick={() => void load()} className="font-mono text-xs text-text-muted hover:text-text-primary transition-colors">Refresh</button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-text-muted">Loading…</p>
      ) : error ? (
        <p className="font-mono text-xs text-status-danger">{error}</p>
      ) : items.length === 0 ? (
        <p className="font-mono text-xs text-text-muted">No issues reported yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <div key={it.id} className="bg-surface-raised border border-border-default rounded-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-text-primary font-bold break-words">{it.title}</p>
                  <p className="font-mono text-[11px] text-text-muted mt-0.5">
                    {it.reporter.name} · {it.reporter.email} · {fmt(it.createdAt)}
                  </p>
                </div>
                <span className={`font-mono text-[9px] tracking-widest border px-1.5 py-0.5 rounded shrink-0 ${STATUS_CLASS[it.status]}`}>
                  {it.status.replace('_', ' ')}
                </span>
              </div>

              <p className="font-mono text-xs text-text-secondary whitespace-pre-wrap mt-3 leading-relaxed">{it.description}</p>

              {it.pageUrl && <p className="font-mono text-[10px] text-text-muted mt-2 break-all">Page: {it.pageUrl}</p>}
              {it.userAgent && <p className="font-mono text-[10px] text-text-muted mt-0.5 break-all">Device: {it.userAgent}</p>}

              {it.imageUrl && (
                <a href={it.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.imageUrl} alt="Screenshot" className="max-h-40 rounded-card border border-border-default hover:border-accent/40 transition-colors" />
                </a>
              )}

              <div className="flex items-center gap-2 mt-4">
                <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">Status</span>
                <select
                  value={it.status}
                  onChange={(e) => void updateStatus(it.id, e.target.value as IssueItem['status'])}
                  className="h-8 bg-background-tertiary border border-border-default rounded-card px-2 font-mono text-[11px] text-text-primary focus:outline-none focus:border-accent"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
