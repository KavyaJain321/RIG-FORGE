'use client'

import { useState, useEffect } from 'react'

interface Project { id: string; name: string }
interface RaiseTicketModalProps {
  userRole: string
  onClose: () => void
  onCreated: () => void
}

export default function RaiseTicketModal({ userRole, onClose, onCreated }: RaiseTicketModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadProjects() {
      const res = await fetch('/api/projects', { credentials: 'include' })
      const json = await res.json() as { data: Project[] | { items: Project[] } | null }
      if (json.data) {
        const list = Array.isArray(json.data) ? json.data : (json.data as { items: Project[] }).items ?? []
        setProjects(list as Project[])
      }
    }
    void loadProjects()
  }, [userRole])

  async function handleSubmit() {
    setError('')
    if (title.trim().length < 5) { setError('Title must be at least 5 characters'); return }
    if (!projectId) { setError('Please select a project'); return }
    if (description.trim().length < 20) { setError('Description must be at least 20 characters'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), projectId }),
      })
      const json = await res.json() as { error: string | null }
      if (!res.ok) { setError(json.error ?? 'Failed to create ticket'); return }
      onCreated()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-raised border border-border-default rounded-card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-mono text-sm tracking-widest uppercase text-text-primary">Raise a Help Ticket</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary font-mono text-lg">×</button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="font-mono text-xs text-text-muted uppercase tracking-widest block mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the problem? (min 5 chars)" className="w-full h-10 bg-background-tertiary border border-border-default rounded-card px-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" />
          </div>

          <div>
            <label className="font-mono text-xs text-text-muted uppercase tracking-widest block mb-1">Project *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full h-10 bg-background-tertiary border border-border-default rounded-card px-3 font-mono text-xs text-text-primary focus:outline-none focus:border-accent">
              <option value="">Select a project...</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="font-mono text-xs text-text-muted uppercase tracking-widest block mb-1">Describe your issue * (min 20 chars)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What are you stuck on? What have you tried? What do you need?" className="w-full bg-background-tertiary border border-border-default rounded-card px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none" />
          </div>

          {error && <p className="font-mono text-xs text-status-danger">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 bg-background-tertiary border border-border-default rounded-card font-mono text-xs text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
            <button type="button" onClick={() => void handleSubmit()} disabled={loading} className="flex-1 h-10 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
