'use client'

import { useRouter } from 'next/navigation'
import TicketStatusBadge from './TicketStatusBadge'

interface TicketCardProps {
  ticket: {
    id: string; title: string; description: string; status: string
    projectName: string; raisedByName: string; raisedById: string
    helperName: string | null; createdAt: string
  }
  currentUserId: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function TicketCard({ ticket, currentUserId }: TicketCardProps) {
  const router = useRouter()
  const isOwn = ticket.raisedById === currentUserId

  return (
    <div
      onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)}
      className="bg-surface-raised border border-border-default rounded-card p-4 cursor-pointer hover:bg-surface-highlight transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-text-primary truncate">{ticket.title}</p>
          <p className="font-mono text-xs text-text-muted mt-1 line-clamp-2">{ticket.description}</p>
          <div className="flex flex-wrap gap-3 mt-2">
            <span className="font-mono text-[10px] text-text-muted">
              {isOwn ? 'Your ticket' : `by ${ticket.raisedByName}`}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              □ {ticket.projectName}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              {timeAgo(ticket.createdAt)}
            </span>
            {ticket.helperName && (
              <span className="font-mono text-[10px] text-blue-400">
                Helper: {ticket.helperName}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <TicketStatusBadge status={ticket.status} />
        </div>
      </div>
    </div>
  )
}
