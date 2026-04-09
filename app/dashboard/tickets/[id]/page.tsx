'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import TicketStatusBadge from '@/components/tickets/TicketStatusBadge'

interface TicketDetail {
  id: string; title: string; description: string; status: string
  projectId: string; projectName: string
  raisedById: string; raisedByName: string; raisedByAvatar: string | null
  helperId: string | null; helperName: string | null; helperAvatar: string | null
  createdAt: string; acceptedAt: string | null; completedAt: string | null; cancelledAt: string | null
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TicketDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { loading } = useAuth()
  const { user } = useAuthStore()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [fetching, setFetching] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAccept, setConfirmAccept] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

  const fetchTicket = useCallback(async () => {
    setFetching(true)
    try {
      const res = await fetch(`/api/tickets/${params.id as string}`, { credentials: 'include' })
      const json = await res.json() as { data: TicketDetail | null }
      if (json.data) setTicket(json.data)
    } finally {
      setFetching(false)
    }
  }, [params.id])

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/login'); return }
      void fetchTicket()
    }
  }, [loading, user, router, fetchTicket])

  async function doAction(endpoint: string) {
    if (!ticket) return
    setActionLoading(true)
    try {
      await fetch(`/api/tickets/${ticket.id}/${endpoint}`, { method: 'POST', credentials: 'include' })
      await fetchTicket()
    } finally {
      setActionLoading(false)
      setConfirmAccept(false)
      setConfirmComplete(false)
    }
  }

  if (loading || !user || fetching) return (
    <div className="flex-1 p-6"><p className="font-mono text-xs text-text-muted">Loading...</p></div>
  )
  if (!ticket) return (
    <div className="flex-1 p-6"><p className="font-mono text-xs text-text-muted">Ticket not found.</p></div>
  )

  const isRaiser = ticket.raisedById === user.id
  const isHelper = ticket.helperId === user.id
  const isOpen = ticket.status === 'OPEN'
  const isAccepted = ticket.status === 'ACCEPTED'

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <button type="button" onClick={() => router.push('/dashboard/tickets')} className="font-mono text-xs text-text-muted hover:text-text-primary mb-6 flex items-center gap-1">
          ← Back to Tickets
        </button>

        <div className="bg-surface-raised border border-border-default rounded-card p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="font-mono text-base text-text-primary flex-1">{ticket.title}</h1>
            <TicketStatusBadge status={ticket.status} />
          </div>

          <div className="flex flex-wrap gap-4 mb-6 font-mono text-xs text-text-muted">
            <span>Raised by: <span className="text-text-secondary">{isRaiser ? 'You' : ticket.raisedByName}</span></span>
            <span>Project: <span className="text-text-secondary">{ticket.projectName}</span></span>
            <span>Raised: <span className="text-text-secondary">{fmt(ticket.createdAt)}</span></span>
          </div>

          <div className="border-t border-border-default pt-4 mb-6">
            <p className="font-mono text-xs text-text-muted uppercase tracking-widest mb-2">Description</p>
            <p className="font-mono text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Accepted info */}
          {ticket.helperId && (
            <div className="border-t border-border-default pt-4 mb-6">
              <p className="font-mono text-xs text-text-muted uppercase tracking-widest mb-2">Helper</p>
              <p className="font-mono text-sm text-text-secondary">
                {isHelper ? 'You are helping' : ticket.helperName}
                {ticket.acceptedAt && <span className="text-text-muted ml-2">· accepted {fmt(ticket.acceptedAt)}</span>}
              </p>
            </div>
          )}

          {/* Completed info */}
          {ticket.completedAt && (
            <div className="border-t border-border-default pt-4 mb-6">
              <p className="font-mono text-sm text-green-400">✓ Resolved {fmt(ticket.completedAt)}</p>
            </div>
          )}

          {/* Action area */}
          <div className="border-t border-border-default pt-4">
            {/* OPEN — third party can help */}
            {isOpen && !isRaiser && !confirmAccept && (
              <button type="button" onClick={() => setConfirmAccept(true)} className="w-full h-10 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity">
                Yes, I Can Help
              </button>
            )}
            {isOpen && !isRaiser && confirmAccept && (
              <div className="flex flex-col gap-3">
                <p className="font-mono text-xs text-text-secondary text-center">By accepting, you&apos;re committing to help with this ticket.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setConfirmAccept(false)} className="flex-1 h-10 bg-background-tertiary border border-border-default rounded-card font-mono text-xs text-text-secondary">Cancel</button>
                  <button type="button" onClick={() => void doAction('accept')} disabled={actionLoading} className="flex-1 h-10 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50">
                    {actionLoading ? 'Accepting...' : "Yes, I'll Help"}
                  </button>
                </div>
              </div>
            )}

            {/* OPEN — raiser sees their ticket label + cancel */}
            {isOpen && isRaiser && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-text-muted">This is your ticket. Waiting for someone to help.</span>
                <button type="button" onClick={() => void doAction('cancel')} className="h-8 px-3 font-mono text-xs text-text-muted hover:text-status-danger transition-colors">
                  Cancel Ticket
                </button>
              </div>
            )}

            {/* ACCEPTED — raiser or helper can complete */}
            {isAccepted && (isRaiser || isHelper) && !confirmComplete && (
              <button type="button" onClick={() => setConfirmComplete(true)} className="w-full h-10 bg-green-500 text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity">
                Mark as Completed
              </button>
            )}
            {isAccepted && (isRaiser || isHelper) && confirmComplete && (
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirmComplete(false)} className="flex-1 h-10 bg-background-tertiary border border-border-default rounded-card font-mono text-xs text-text-secondary">Cancel</button>
                <button type="button" onClick={() => void doAction('complete')} disabled={actionLoading} className="flex-1 h-10 bg-green-500 text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50">
                  {actionLoading ? 'Completing...' : 'Yes, Mark Complete'}
                </button>
              </div>
            )}

            {/* ACCEPTED — third party, no actions */}
            {isAccepted && !isRaiser && !isHelper && (
              <p className="font-mono text-xs text-text-muted text-center">{ticket.helperName} is helping with this ticket.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
