'use client'

import { useEffect, useState } from 'react'

interface Draft {
  id: string
  draftSummary: string
  draftNotes: string | null
  status: 'PENDING' | 'APPROVED' | 'DISMISSED'
}

export default function DailyLogDraftCard() {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedSummary, setEditedSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/assistant/daily-log-draft', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as { data?: { draft: Draft | null } }
        if (json.data?.draft) {
          setDraft(json.data.draft)
          setEditedSummary(json.data.draft.draftSummary)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function send(action: 'approve' | 'dismiss', payload?: { editedSummary?: string }) {
    if (!draft) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/assistant/daily-log-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ draftId: draft.id, action, ...payload }),
      })
      const json = (await res.json()) as { data?: unknown; error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong.')
        return
      }
      setHidden(true)
    } catch {
      setError('Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !draft || draft.status !== 'PENDING' || hidden) return null

  return (
    <div className="bg-surface-raised border border-border-default rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-mono uppercase tracking-widest text-text-primary">
            Daily log drafted by Forgie
          </h3>
          <p className="text-xs text-text-muted mt-0.5">Based on what you did today. Tap to approve or edit.</p>
        </div>
        <span className="font-mono text-[10px] tracking-widest text-text-muted">DRAFT</span>
      </div>

      {editing ? (
        <textarea
          value={editedSummary}
          onChange={(e) => setEditedSummary(e.target.value)}
          rows={4}
          maxLength={2000}
          className="w-full bg-surface-highlight border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#1A1A1A] resize-none"
        />
      ) : (
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
          {draft.draftSummary}
        </p>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() =>
            void send('approve', editing ? { editedSummary: editedSummary.trim() } : undefined)
          }
          disabled={submitting || (editing && editedSummary.trim().length === 0)}
          className="flex-1 h-9 bg-[#1A1A1A] text-white text-sm font-medium rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
        >
          {submitting ? '...' : editing ? 'Save & submit' : 'Looks good — submit'}
        </button>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          disabled={submitting}
          className="px-4 h-9 bg-surface-raised border border-border-default text-sm text-text-secondary hover:text-text-primary rounded-lg transition-colors disabled:opacity-50"
        >
          {editing ? 'Cancel edit' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={() => void send('dismiss')}
          disabled={submitting}
          className="px-4 h-9 text-sm text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
