'use client'

import type { NotificationItem as NotificationItemType } from '@/store/notificationStore'

// ─── Type icon map ─────────────────────────────────────────────────────────

function getTypeSymbol(type: string): string {
  switch (type) {
    case 'TICKET_RAISED':         return '■'
    case 'TICKET_ACCEPTED':       return '○'
    case 'TICKET_COMPLETED':      return '✓'
    case 'TICKET_CANCELLED':      return '✕'
    case 'TASK_ASSIGNED':         return '◆'
    case 'TASK_DONE':             return '✓'
    case 'TASK_OVERDUE':          return '⚠'
    case 'PROJECT_UPDATE':        return '▸'
    case 'PROJECT_ANNOUNCEMENT':  return '◉'
    case 'PROJECT_MEMBER_ADDED':  return '+'
    case 'PROJECT_LEAD_ASSIGNED': return '★'
    case 'ONBOARDING_APPROVED':   return '✓'
    case 'ONBOARDING_PENDING':    return '◌'
    default:                      return '◉'
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'TICKET_RAISED':
    case 'TICKET_ACCEPTED':
    case 'ONBOARDING_PENDING':    return 'text-status-warning'
    case 'TICKET_COMPLETED':
    case 'TASK_DONE':
    case 'ONBOARDING_APPROVED':   return 'text-status-success'
    case 'TICKET_CANCELLED':
    case 'TASK_OVERDUE':          return 'text-status-danger'
    case 'TASK_ASSIGNED':
    case 'PROJECT_MEMBER_ADDED':
    case 'PROJECT_LEAD_ASSIGNED': return 'text-accent'
    default:                      return 'text-text-muted'
  }
}

// ─── Relative time ─────────────────────────────────────────────────────────

function formatRelativeTime(createdAt: Date): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr  = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr  < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'Yesterday'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: NotificationItemType
  onRead: (id: string) => void
  onNavigate: (linkTo: string) => void
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function NotificationItem({
  notification,
  onRead,
  onNavigate,
}: NotificationItemProps) {
  const { id, type, title, body, read, linkTo, createdAt } = notification

  function handleClick() {
    onRead(id)
    if (linkTo) onNavigate(linkTo)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      className={[
        'flex gap-3 px-4 py-3 border-b border-border-default cursor-pointer',
        'transition-colors hover:bg-background-tertiary',
        read ? 'bg-transparent' : 'bg-background-primary/50',
      ].join(' ')}
    >
      {/* Left: unread dot + type symbol */}
      <div className="flex items-start gap-1.5 shrink-0 pt-0.5">
        {/* Unread indicator */}
        <span
          className={[
            'block rounded-full w-[6px] h-[6px] mt-[3px] shrink-0',
            read ? 'bg-transparent' : 'bg-accent',
          ].join(' ')}
        />
        {/* Type symbol */}
        <span className={['text-sm font-mono leading-none', getTypeColor(type)].join(' ')}>
          {getTypeSymbol(type)}
        </span>
      </div>

      {/* Center: title + body + time */}
      <div className="flex-1 min-w-0">
        <p
          className={[
            'font-mono text-xs text-text-primary truncate leading-snug',
            read ? 'font-normal' : 'font-bold',
          ].join(' ')}
        >
          {title}
        </p>
        <p className="font-mono text-[10px] text-text-secondary leading-relaxed line-clamp-2 mt-0.5">
          {body}
        </p>
        <p className="font-mono text-[10px] text-text-muted mt-1">
          {formatRelativeTime(createdAt)}
        </p>
      </div>

      {/* Right: link arrow */}
      {linkTo && (
        <span className="text-text-muted text-xs shrink-0 pt-0.5">→</span>
      )}
    </div>
  )
}
