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
    const hasUnread = unreadCount > 0
    const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

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
          aria-label="Notifications"
          aria-expanded={isOpen}
        >
          {/* Bell symbol */}
          <span
            className={[
              'font-mono text-xs shrink-0',
              hasUnread ? 'text-accent' : 'text-text-muted',
            ].join(' ')}
          >
            ◉
          </span>

          {/* Label */}
          <span
            className={[
              'flex-1 text-left',
              hasUnread ? 'text-text-primary' : 'text-text-secondary',
            ].join(' ')}
          >
            NOTIFICATIONS
          </span>

          {/* Right side: badge + connection dot */}
          <span className="flex items-center gap-2 shrink-0">
            {hasUnread && (
              <span
                className="rounded-full min-w-[18px] h-[18px] bg-accent text-background-primary font-mono text-[10px] font-bold flex items-center justify-center px-1 bell-pulse"
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
              title={connected ? 'Live' : 'Disconnected'}
            />
          </span>
        </button>
      </div>
    )
  }
)

export default NotificationBell
