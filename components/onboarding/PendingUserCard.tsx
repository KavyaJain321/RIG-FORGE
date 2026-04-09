'use client'

import { useState } from 'react'
import ApproveUserModal from './ApproveUserModal'

interface PendingUser {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
  hasLoggedIn: boolean
  lastSeenAt: string | null
}

interface PendingUserCardProps {
  user: PendingUser
  onAction: () => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default function PendingUserCard({ user, onAction }: PendingUserCardProps) {
  const [showApprove, setShowApprove] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)

  async function handleReject() {
    setRejecting(true)
    try {
      await fetch(`/api/admin/onboarding/reject/${user.id}`, { method: 'DELETE', credentials: 'include' })
      onAction()
    } finally {
      setRejecting(false)
      setConfirmReject(false)
    }
  }

  return (
    <>
      <div className="bg-surface-raised border border-border-default rounded-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm text-text-primary">{user.name}</p>
            <p className="font-mono text-xs text-text-secondary mt-0.5">{user.email}</p>
            <div className="flex gap-3 mt-2">
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">{user.role}</span>
              <span className="font-mono text-[10px] text-text-muted">Created: {timeAgo(user.createdAt)}</span>
              {user.hasLoggedIn ? (
                <span className="font-mono text-[10px] text-green-400">● Has logged in</span>
              ) : (
                <span className="font-mono text-[10px] text-text-muted">○ Not yet logged in</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {!confirmReject ? (
              <>
                <button type="button" onClick={() => setShowApprove(true)} className="h-8 px-3 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity">
                  Accept & Assign
                </button>
                <button type="button" onClick={() => setConfirmReject(true)} className="h-8 px-3 bg-background-tertiary border border-border-default font-mono text-xs text-text-secondary hover:text-status-danger hover:border-status-danger rounded-card transition-colors">
                  Reject
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-status-danger">Sure?</span>
                <button type="button" onClick={() => void handleReject()} disabled={rejecting} className="h-8 px-3 bg-status-danger text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50">
                  {rejecting ? '...' : 'Yes, Reject'}
                </button>
                <button type="button" onClick={() => setConfirmReject(false)} className="h-8 px-3 bg-background-tertiary border border-border-default font-mono text-xs text-text-secondary rounded-card">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showApprove && (
        <ApproveUserModal
          userId={user.id}
          userName={user.name}
          onClose={() => setShowApprove(false)}
          onApproved={() => { setShowApprove(false); onAction() }}
        />
      )}
    </>
  )
}
