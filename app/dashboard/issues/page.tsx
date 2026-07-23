'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

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

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export default function IssuesPage() {
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
      setError('')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="font-mono text-sm tracking-widest uppercase text-text-primary">Issues</h1>
        <button type="button" onClick={() => void load()} className="font-mono text-xs text-text-muted hover:text-text-primary transition-colors">Refresh</button>
      </div>

      <NewIssue onCreated={load} />

      {loading ? (
        <p className="font-mono text-xs text-text-muted mt-6">Loading…</p>
      ) : error ? (
        <p className="font-mono text-xs text-status-danger mt-6">{error}</p>
      ) : items.length === 0 ? (
        <p className="font-mono text-xs text-text-muted mt-6">No issues yet. Raise the first one above.</p>
      ) : (
        <div className="flex flex-col gap-3 mt-6">
          {items.map((it) => <IssueCard key={it.id} issue={it} onChanged={load} />)}
        </div>
      )}
    </div>
  )
}

// ─── New issue (collapsible, open to everyone) ────────────────────────────────

function NewIssue({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!image) { setPreview(null); return }
    const url = URL.createObjectURL(image)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  function pickImage(f: File | null) {
    setError('')
    if (!f) { setImage(null); return }
    if (!f.type.startsWith('image/')) { setError('Attachment must be an image'); return }
    if (f.size > MAX_IMAGE_BYTES) { setError('Image must be under 5MB'); return }
    setImage(f)
  }

  function reset() {
    setTitle(''); setDescription(''); setImage(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit() {
    if (loading) return
    setError('')
    if (title.trim().length < 5) { setError('Title must be at least 5 characters'); return }
    if (description.trim().length < 15) { setError('Please add a bit more detail (min 15 characters)'); return }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('description', description.trim())
      fd.append('pageUrl', typeof window !== 'undefined' ? document.referrer : '')
      if (image) fd.append('image', image)
      const res = await fetch('/api/issues', { method: 'POST', credentials: 'include', body: fd })
      const json = (await res.json()) as { error: string | null }
      if (!res.ok) { setError(json.error ?? 'Failed to submit'); return }
      reset(); setOpen(false); onCreated()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-11 bg-accent text-white font-mono text-xs tracking-widest uppercase rounded-card hover:opacity-90 transition-opacity"
      >
        + Raise an Issue
      </button>
    )
  }

  return (
    <div className="bg-surface-raised border border-border-default rounded-card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs tracking-widest uppercase text-text-primary">New Issue</p>
        <button type="button" onClick={() => { reset(); setOpen(false) }} className="font-mono text-text-muted hover:text-text-primary text-lg leading-none">×</button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={150}
        placeholder="Short summary"
        className="w-full h-10 bg-background-tertiary border border-border-default rounded-card px-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={5}
        maxLength={4000}
        placeholder="What happened? What did you expect? Which project or page?"
        className="w-full bg-background-tertiary border border-border-default rounded-card px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
        className="block w-full font-mono text-xs text-text-muted file:mr-3 file:h-9 file:px-3 file:rounded-card file:border file:border-border-default file:bg-background-tertiary file:font-mono file:text-xs file:text-text-secondary hover:file:text-text-primary"
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Preview" className="max-h-40 rounded-card border border-border-default" />
      )}
      {error && <p className="font-mono text-xs text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { reset(); setOpen(false) }} className="flex-1 h-10 bg-background-tertiary border border-border-default rounded-card font-mono text-xs text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={loading} className="flex-1 h-10 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50 transition-opacity">
          {loading ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}

// ─── Issue card (view + edit, open to everyone) ───────────────────────────────

function IssueCard({ issue, onChanged }: { issue: IssueItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(issue.title)
  const [description, setDescription] = useState(issue.description)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function patch(payload: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/issues/${issue.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null)
    return !!res && res.ok
  }

  async function saveEdit() {
    if (saving) return
    setError('')
    if (title.trim().length < 5) { setError('Title must be at least 5 characters'); return }
    if (description.trim().length < 5) { setError('Description must be at least 5 characters'); return }
    setSaving(true)
    const ok = await patch({ title: title.trim(), description: description.trim() })
    setSaving(false)
    if (!ok) { setError('Failed to save'); return }
    setEditing(false); onChanged()
  }

  async function changeStatus(status: IssueItem['status']) {
    const ok = await patch({ status })
    if (ok) onChanged()
  }

  return (
    <div className="bg-surface-raised border border-border-default rounded-card p-4">
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            className="w-full h-10 bg-background-tertiary border border-border-default rounded-card px-3 font-mono text-xs text-text-primary focus:outline-none focus:border-accent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={4000}
            className="w-full bg-background-tertiary border border-border-default rounded-card px-3 py-2 font-mono text-xs text-text-primary focus:outline-none focus:border-accent resize-none"
          />
          {error && <p className="font-mono text-xs text-status-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setTitle(issue.title); setDescription(issue.description); setEditing(false); setError('') }} className="flex-1 h-9 bg-background-tertiary border border-border-default rounded-card font-mono text-xs text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
            <button type="button" onClick={() => void saveEdit()} disabled={saving} className="flex-1 h-9 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm text-text-primary font-bold break-words">{issue.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[9px] font-bold text-accent-ink shrink-0">{initials(issue.reporter.name)}</span>
                <p className="font-mono text-[11px] text-text-muted truncate">{issue.reporter.name} · {fmt(issue.createdAt)}</p>
              </div>
            </div>
            <span className={`font-mono text-[9px] tracking-widest border px-1.5 py-0.5 rounded shrink-0 ${STATUS_CLASS[issue.status]}`}>{issue.status.replace('_', ' ')}</span>
          </div>

          <p className="font-mono text-xs text-text-secondary whitespace-pre-wrap mt-3 leading-relaxed break-words">{issue.description}</p>

          {issue.pageUrl && <p className="font-mono text-[10px] text-text-muted mt-2 break-all">Page: {issue.pageUrl}</p>}

          {issue.imageUrl && (
            <a href={issue.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={issue.imageUrl} alt="Screenshot" className="max-h-40 rounded-card border border-border-default hover:border-accent/40 transition-colors" />
            </a>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button type="button" onClick={() => setEditing(true)} className="h-8 px-3 bg-background-tertiary border border-border-default rounded-card font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors">Edit</button>
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest ml-1">Status</span>
            <select
              value={issue.status}
              onChange={(e) => void changeStatus(e.target.value as IssueItem['status'])}
              className="h-8 bg-background-tertiary border border-border-default rounded-card px-2 font-mono text-[11px] text-text-primary focus:outline-none focus:border-accent"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </>
      )}
    </div>
  )
}
