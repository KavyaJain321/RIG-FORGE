'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { isAdminRole } from '@/lib/auth'
import TicketStatusBadge from '@/components/tickets/TicketStatusBadge'

interface TicketDetail {
  id: string; title: string; description: string; status: string
  projectId: string; projectName: string
  raisedById: string; raisedByName: string; raisedByAvatar: string | null
  helperId: string | null; helperName: string | null; helperAvatar: string | null
  createdAt: string; acceptedAt: string | null; completedAt: string | null; cancelledAt: string | null
}

interface TicketComment {
  id: string
  body: string
  createdAt: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  authorRole: string
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
  const [comments, setComments] = useState<TicketComment[]>([])
  const [reply, setReply] = useState('')
  const [posting, setPosting] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAccept, setConfirmAccept] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [confirmResolve, setConfirmResolve] = useState(false)

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

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/tickets/${params.id as string}/comments`, { credentials: 'include' })
    if (!res.ok) return
    const json = await res.json() as { data: TicketComment[] | null }
    if (json.data) setComments(json.data)
  }, [params.id])

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/login'); return }
      void fetchTicket()
      void fetchComments()
    }
  }, [loading, user, router, fetchTicket, fetchComments])

  // Employees can only view their own tickets — redirect if forbidden
  useEffect(() => {
    if (ticket && user && !isAdminRole(user.role) && ticket.raisedById !== user.id) {
      router.replace('/dashboard/tickets')
    }
  }, [ticket, user, router])

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
      setConfirmResolve(false)
    }
  }

  async function postReply() {
    if (!ticket || posting) return
    const body = reply.trim()
    if (body.length === 0) return
    setPosting(true)
    setReplyError(null)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json() as { data: TicketComment | null; error: string | null }
      if (!res.ok || !json.data) {
        setReplyError(json.error ?? 'Failed to post reply')
        return
      }
      setComments((prev) => [...prev, json.data!])
      setReply('')
    } catch {
      setReplyError('Network error. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  if (loading || !user || fetching) return (
    <div className="flex-1 p-6"><p className="font-mono text-xs text-text-muted">Loading...</p></div>
  )
  if (!ticket) return (
    <div className="flex-1 p-6"><p className="font-mono text-xs text-text-muted">Ticket not found.</p></div>
  )

  const isRaiser  = ticket.raisedById === user.id
  const isHelper  = ticket.helperId === user.id
  const isAdmin   = isAdminRole(user.role)
  const isOpen    = ticket.status === 'OPEN'
  const isAccepted = ticket.status === 'ACCEPTED'
  const isClosed   = ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED'
  const canReply   = !isClosed && (isAdmin || isRaiser || isHelper)
  const canResolve = !isClosed && (isAdmin || isRaiser || isHelper)

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
            {/* OPEN — only admins can accept/help (not the raiser, not employees) */}
            {isOpen && !isRaiser && isAdmin && !confirmAccept && (
              <button type="button" onClick={() => setConfirmAccept(true)} className="w-full h-10 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity">
                Yes, I Can Help
              </button>
            )}
            {isOpen && !isRaiser && isAdmin && confirmAccept && (
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
            {isAccepted && !isRaiser && !isHelper && !isAdmin && (
              <p className="font-mono text-xs text-text-muted text-center">{ticket.helperName} is helping with this ticket.</p>
            )}

            {/* "Mark as Resolved" — shown to:
                 - admin raisers on an OPEN ticket (close without forcing accept flow)
                 - any admin viewing an ACCEPTED ticket who isn't already the raiser/helper
                   (the raiser/helper path uses the /complete endpoint above).
                 Suppressed when other confirm flows are active. */}
            {canResolve && !confirmResolve && !confirmAccept && !confirmComplete && (
              (isOpen && isRaiser && isAdmin) ||
              (isAccepted && !isRaiser && !isHelper && isAdmin)
            ) && (
              <button
                type="button"
                onClick={() => setConfirmResolve(true)}
                className="w-full h-10 mt-2 bg-green-500 text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity"
              >
                Mark as Resolved
              </button>
            )}
            {confirmResolve && (
              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setConfirmResolve(false)}
                  className="flex-1 h-10 bg-background-tertiary border border-border-default rounded-card font-mono text-xs text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void doAction('resolve')}
                  disabled={actionLoading}
                  className="flex-1 h-10 bg-green-500 text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading ? 'Resolving...' : 'Yes, Mark Resolved'}
                </button>
              </div>
            )}
          </div>

          {/* Replies / conversation thread */}
          <div className="border-t border-border-default mt-6 pt-4">
            <p className="font-mono text-xs text-text-muted uppercase tracking-widest mb-3">
              Replies {comments.length > 0 && `(${comments.length})`}
            </p>

            {comments.length === 0 ? (
              <p className="font-mono text-xs text-text-muted italic mb-3">
                No replies yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3 mb-4">
                {comments.map((c) => {
                  const isAuthorAdmin = c.authorRole === 'ADMIN' || c.authorRole === 'SUPER_ADMIN'
                  return (
                    <div
                      key={c.id}
                      className="bg-background-tertiary border border-border-default rounded-card p-3"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-xs text-text-primary">
                          {c.authorId === user.id ? 'You' : c.authorName}
                        </span>
                        {isAuthorAdmin && (
                          <span className="font-mono text-[9px] uppercase tracking-widest text-accent">
                            Admin
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-text-muted ml-auto">
                          {fmt(c.createdAt)}
                        </span>
                      </div>
                      <p className="font-mono text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                        {c.body}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {canReply ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={isRaiser ? 'Add more context or reply…' : 'Write a reply to the user…'}
                  className="w-full bg-background-tertiary border border-border-default rounded-card px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
                />
                {replyError && (
                  <p className="font-mono text-xs text-status-danger">{replyError}</p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void postReply()}
                    disabled={posting || reply.trim().length === 0}
                    className="h-9 px-4 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {posting ? 'Posting…' : 'Post Reply'}
                  </button>
                </div>
              </div>
            ) : (
              isClosed && (
                <p className="font-mono text-xs text-text-muted italic">
                  This ticket is closed. Replies are disabled.
                </p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
