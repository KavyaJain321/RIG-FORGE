'use client'

import { useState, useEffect } from 'react'

interface Project { id: string; name: string; status: string }
interface ApproveUserModalProps {
  userId: string
  userName: string
  onClose: () => void
  onApproved: () => void
}

export default function ApproveUserModal({ userId, userName, onClose, onApproved }: ApproveUserModalProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/projects', { credentials: 'include' })
        const json = await res.json() as { data: { items?: Project[]; projects?: Project[] } | null }
        const list = json.data ? (Array.isArray(json.data) ? json.data : (json.data.items ?? json.data.projects ?? [])) : []
        setProjects((list as Project[]).filter((p) => p.status === 'ACTIVE'))
      } finally {
        setLoadingProjects(false)
      }
    }
    void load()
  }, [])

  function toggle(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleApprove() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/onboarding/approve/${userId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: selectedIds }),
      })
      if (res.ok) onApproved()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-raised border border-border-default rounded-card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-mono text-sm tracking-widest uppercase text-text-primary">Approve {userName}</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary font-mono text-lg">×</button>
        </div>

        <div className="mb-4">
          <label className="font-mono text-xs text-text-muted uppercase tracking-widest block mb-2">Assign to Projects (optional)</label>
          {loadingProjects ? (
            <p className="font-mono text-xs text-text-muted">Loading projects...</p>
          ) : projects.length === 0 ? (
            <p className="font-mono text-xs text-text-muted">No active projects available.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-border-default rounded-card">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-highlight border-b border-border-default last:border-b-0">
                  <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} className="accent-accent" />
                  <span className="font-mono text-xs text-text-secondary">{p.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <p className="font-mono text-[10px] text-text-muted mb-4">You can change project assignments later from inside each project.</p>

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-10 bg-background-tertiary border border-border-default rounded-card font-mono text-xs text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button type="button" onClick={() => void handleApprove()} disabled={loading} className="flex-1 h-10 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50 transition-opacity">
            {loading ? 'Approving...' : 'Approve & Welcome'}
          </button>
        </div>
      </div>
    </div>
  )
}
