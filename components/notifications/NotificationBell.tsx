'use client'

import { forwardRef } from 'react'
import { useNotificationStore } from '@/store/notificationStore'

// ─── Props ─────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  onClick: () => void
  isOpen: boolean
}

// ─── Component ─────────────────────────────────────────────────────────────

const NotificationBell = forwardRef<HTMLDivElement, NotificationBellProps>(
  function NotificationBell({ onClick, isOpen }, ref) {
    const { unreadCount, connected } = useNotificationStore()
    const hasUnread  = unreadCount > 0
    const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

    return (
      <div ref={ref}>
        <button
          type="button"
          onClick={onClick}
          className={[
            'w-full flex items-center gap-3 px-3 py-2 h-10 border-l-[3px] transition-colors',
            'font-mono text-xs tracking-widest uppercase',
            isOpen
              ? 'border-accent bg-background-tertiary'
              : 'border-transparent hover:bg-background-tertiary',
          ].join(' ')}
          aria-label={`Notifications${hasUnread ? ` (${unreadCount} unread)` : ''}`}
          aria-expanded={isOpen}
        >
          {/* Bell icon with pulsing red dot overlay when there are unreads */}
          <span className="relative shrink-0 flex items-center justify-center">
            <span
              className={[
                'font-mono text-xs',
                hasUnread ? 'text-accent' : 'text-text-muted',
              ].join(' ')}
            >
              ◉
            </span>

            {/* Pulsing red dot — visible immediately when unread > 0 */}
            {hasUnread && (
              <span
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500"
                style={{ animation: 'notif-ping 1.2s ease-in-out infinite' }}
              />
            )}
          </span>

          {/* Label */}
          <span
            className={[
              'flex-1 text-left',
              hasUnread ? 'text-text-primary font-semibold' : 'text-text-secondary',
            ].join(' ')}
          >
            NOTIFICATIONS
          </span>

          {/* Right side: count badge + connection dot */}
          <span className="flex items-center gap-2 shrink-0">
            {hasUnread && (
              <span
                className="rounded-full min-w-[20px] h-5 bg-red-500 text-white font-mono text-[10px] font-bold flex items-center justify-center px-1.5 bell-pulse"
                style={{ lineHeight: 1 }}
              >
                {badgeLabel}
              </span>
            )}

            {/* Connection indicator dot */}
            <span
              className={[
                'block rounded-full shrink-0',
                'w-[6px] h-[6px]',
                connected ? 'bg-status-success' : 'bg-status-offline',
              ].join(' ')}
              title={connected ? 'Live' : 'Polling'}
            />
          </span>
        </button>
      </div>
    )
  }
)

export default NotificationBell
