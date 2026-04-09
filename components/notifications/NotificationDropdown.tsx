'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import { useNotificationStore } from '@/store/notificationStore'
import NotificationItem from './NotificationItem'
import type { NotificationItem as NotificationItemType } from '@/store/notificationStore'

// ─── Shimmer row ───────────────────────────────────────────────────────────

function ShimmerRow() {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-border-default">
      <div className="w-4 h-4 bg-background-tertiary forge-shimmer rounded shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <div className="h-2.5 bg-background-tertiary forge-shimmer rounded w-3/4" />
        <div className="h-2 bg-background-tertiary forge-shimmer rounded w-full" />
        <div className="h-2 bg-background-tertiary forge-shimmer rounded w-1/2" />
      </div>
    </div>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface NotificationDropdownProps {
  isOpen: boolean
  onClose: () => void
  bellRef: React.RefObject<HTMLDivElement>
}

// ─── REST helpers ──────────────────────────────────────────────────────────

interface NotificationsApiResponse {
  data: {
    items: NotificationItemType[]
    nextCursor: string | null
    unreadCount: number
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function NotificationDropdown({
  isOpen,
  onClose,
  bellRef,
}: NotificationDropdownProps) {
  const router = useRouter()

  const {
    notifications,
    unreadCount,
    connected,
    setNotifications,
    markRead,
    markAllRead,
    setUnreadCount,
  } = useNotificationStore()

  const dropdownRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [topPx, setTopPx] = useState(80)

  // ─── Position panel relative to bell ────────────────────────────────

  useEffect(() => {
    if (!isOpen || !bellRef.current) return

    const rect = bellRef.current.getBoundingClientRect()
    const panelMaxH = window.innerHeight * 0.8
    const idealTop = rect.top
    const clampedTop = Math.min(idealTop, window.innerHeight - panelMaxH - 16)

    setTopPx(Math.max(0, clampedTop))
  }, [isOpen, bellRef])

  // ─── Click-outside handler ───────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      const insideDropdown = dropdownRef.current?.contains(target)
      const insideBell = bellRef.current?.contains(target)
      if (!insideDropdown && !insideBell) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, bellRef, onClose])

  // ─── Escape key ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // ─── Fetch on open ───────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=20', {
        credentials: 'include',
      })
      if (!res.ok) return

      const json = (await res.json()) as NotificationsApiResponse
      const { items, nextCursor, unreadCount: count } = json.data

      setNotifications(items)
      setUnreadCount(count)
      setCursor(nextCursor)
      setHasMore(nextCursor !== null)
    } catch {
      // Silently fail — store already has any real-time notifications
    } finally {
      setLoading(false)
    }
  }, [setNotifications, setUnreadCount])

  useEffect(() => {
    if (isOpen) {
      void fetchNotifications()
    }
  }, [isOpen, fetchNotifications])

  // ─── Load more ───────────────────────────────────────────────────────

  async function handleLoadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/notifications?limit=20&cursor=${encodeURIComponent(cursor)}`,
        { credentials: 'include' }
      )
      if (!res.ok) return

      const json = (await res.json()) as NotificationsApiResponse
      const { items, nextCursor } = json.data

      // Append older notifications (deduplicated via setNotifications merge)
      setNotifications([...notifications, ...items])
      setCursor(nextCursor)
      setHasMore(nextCursor !== null)
    } catch {
      // silently skip
    } finally {
      setLoadingMore(false)
    }
  }

  // ─── Mark all read ───────────────────────────────────────────────────

  async function handleMarkAllRead() {
    if (unreadCount === 0) return
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        credentials: 'include',
      })
      markAllRead()
    } catch {
      // Optimistic update already applied via markAllRead
    }
  }

  // ─── Mark single read ────────────────────────────────────────────────

  async function handleRead(id: string) {
    markRead(id) // optimistic
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      })
    } catch {
      // Already marked in store
    }
  }

  function handleNavigate(linkTo: string) {
    onClose()
    router.push(linkTo)
  }

  // ─── Don't render if closed ──────────────────────────────────────────

  if (!isOpen) return null

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        left: '240px',
        top: `${topPx}px`,
        width: '360px',
        maxHeight: '80vh',
        zIndex: 100,
        boxShadow: '0 0 40px rgba(0,0,0,0.8)',
      }}
      className="flex flex-col bg-background-secondary border border-border-default overflow-hidden"
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
        <span className="font-mono text-[10px] text-text-muted tracking-widest">
          NOTIFICATIONS 
        </span>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <span
            className={[
              'font-mono text-[10px] tracking-widest',
              connected ? 'text-status-success' : 'text-text-muted',
            ].join(' ')}
          >
            {connected ? '● LIVE' : '○ POLLING'}
          </span>

          {/* Mark all read */}
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={unreadCount === 0}
            className={[
              'font-mono text-[10px] tracking-widest transition-colors',
              unreadCount > 0
                ? 'text-text-muted hover:text-accent cursor-pointer'
                : 'text-text-muted opacity-40 cursor-not-allowed',
            ].join(' ')}
          >
            MARK ALL READ
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
          </>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="text-text-muted text-2xl mb-2">◉</span>
            <span className="font-mono text-xs text-text-muted tracking-widest">
              ALL CAUGHT UP 
            </span>
          </div>
        ) : (
          <>
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={(id) => void handleRead(id)}
                onNavigate={handleNavigate}
              />
            ))}

            {hasMore && (
              <div className="flex justify-center mx-4 my-3">
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  disabled={loadingMore}
                  className="font-mono text-xs text-text-muted border border-border-default px-4 py-2 tracking-widest hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
                >
                  {loadingMore ? 'LOADING…' : 'LOAD MORE'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
