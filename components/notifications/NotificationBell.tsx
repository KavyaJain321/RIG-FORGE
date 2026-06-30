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
            'flex items-center gap-2 lg:gap-3 px-2 lg:px-3 py-2 h-10 rounded-full lg:rounded-none',
            'lg:w-full border-l-0 lg:border-l-[3px] transition-colors',
            'font-mono text-xs tracking-widest uppercase',
            isOpen
              ? 'border-accent bg-background-tertiary'
              : 'border-transparent hover:bg-background-tertiary',
          ].join(' ')}
          aria-label={`Notifications${hasUnread ? ` (${unreadCount} unread)` : ''}`}
          aria-expanded={isOpen}
        >
          {/* Bell icon with the unread count badged on its top-left corner
              (top-left keeps the badge inward, away from the screen edge). */}
          <span className="relative shrink-0 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`h-5 w-5 ${hasUnread ? 'text-accent-ink' : 'text-text-muted'}`}
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>

            {hasUnread && (
              <span
                className="absolute -top-2 -left-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white font-mono text-[9px] font-bold flex items-center justify-center leading-none bell-pulse"
              >
                {badgeLabel}
              </span>
            )}
          </span>

          {/* Label — desktop only */}
          <span
            className={[
              'hidden lg:block flex-1 text-left',
              hasUnread ? 'text-text-primary font-semibold' : 'text-text-secondary',
            ].join(' ')}
          >
            NOTIFICATIONS
          </span>

          {/* Connection dot — desktop only so the mobile bell stays clean */}
          <span
            className={[
              'hidden lg:block rounded-full shrink-0 w-[6px] h-[6px]',
              connected ? 'bg-status-success' : 'bg-status-offline',
            ].join(' ')}
            title={connected ? 'Live' : 'Polling'}
          />
        </button>
      </div>
    )
  }
)

export default NotificationBell
