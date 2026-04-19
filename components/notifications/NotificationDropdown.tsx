'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import { useNotificationStore } from '@/store/notificationStore'
import NotificationItem from './NotificationItem'
import type { NotificationItem as NotificationItemType } from '@/store/notificationStore'

// ─── Shimmer ────────────────────────────────────────────────────────────────

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

// ─── Props ──────────────────────────────────────────────────────────────────

interface NotificationDropdownProps {
  isOpen:   boolean
  onClose:  () => void
  bellRef:  React.RefObject<HTMLDivElement>
  isAdmin?: boolean
}

interface NotificationsApiResponse {
  data: { items: NotificationItemType[]; nextCursor: string | null; unreadCount: number }
}

// ─── Admin Broadcast Panel ───────────────────────────────────────────────────

function AdminBroadcastPanel() {
  const [expanded, setExpanded] = useState(false)
  const [target, setTarget]     = useState<'ALL' | 'ONE'>('ALL')
  const [userId, setUserId]     = useState('')
  const [title, setTitle]       = useState('')
  const [body, setBody]         = useState('')
  const [sending, setSending]   = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  async function send() {
    if (!title.trim() || !body.trim()) return
    if (target === 'ONE' && !userId.trim()) return
    setSending(true); setFeedback(null)
    try {
      const res = await fetch('/api/notifications/admin-send', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: target === 'ALL' ? 'ALL' : userId.trim(), title: title.trim(), body: body.trim() }),
      })
      const json = await res.json() as { data?: { sent: number }; error?: string }
      if (res.ok && json.data) {
        setFeedback({ ok: true, msg: `Sent to ${json.data.sent} user${json.data.sent !== 1 ? 's' : ''}` })
        setTitle(''); setBody(''); setUserId('')
      } else {
        setFeedback({ ok: false, msg: json.error ?? 'Failed to send' })
      }
    } catch { setFeedback({ ok: false, msg: 'Network error' }) }
    finally { setSending(false) }
  }

  return (
    <div className="border-t border-border-default">
      <button
        type="button"
        onClick={() => { setExpanded(v => !v); setFeedback(null) }}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-background-tertiary transition-colors"
      >
        <span className="font-mono text-[10px] tracking-widest text-accent uppercase">◉ BROADCAST NOTIFICATION</span>
        <span className="font-mono text-xs text-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2.5">
          <div className="flex gap-2">
            {(['ALL', 'ONE'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTarget(t)}
                className={`flex-1 font-mono text-[10px] tracking-widest py-1.5 border transition-colors ${
                  target === t ? 'border-accent text-accent bg-accent/5' : 'border-border-default text-muted hover:border-accent/50'
                }`}>
                {t === 'ALL' ? 'ALL MEMBERS' : 'ONE MEMBER'}
              </button>
            ))}
          </div>
          {target === 'ONE' && (
            <input type="text" placeholder="User ID or email..." value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full border border-border-default bg-background-primary px-3 py-1.5 font-mono text-xs text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors" />
          )}
          <input type="text" placeholder="Notification title..." value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-border-default bg-background-primary px-3 py-1.5 font-mono text-xs text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors" />
          <textarea placeholder="Message..." value={body} onChange={e => setBody(e.target.value)} rows={3}
            className="w-full border border-border-default bg-background-primary px-3 py-1.5 font-mono text-xs text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none" />
          {feedback && (
            <p className={`font-mono text-[10px] tracking-wide ${feedback.ok ? 'text-status-success' : 'text-status-danger'}`}>
              {feedback.ok ? '✓ ' : '✕ '}{feedback.msg}
            </p>
          )}
          <button type="button" onClick={() => void send()}
            disabled={sending || !title.trim() || !body.trim() || (target === 'ONE' && !userId.trim())}
            className="w-full border border-accent text-accent font-mono text-[10px] tracking-widest py-2 hover:bg-accent hover:text-background-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {sending ? 'SENDING...' : target === 'ALL' ? 'SEND TO ALL MEMBERS' : 'SEND TO MEMBER'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function NotificationDropdown({ isOpen, onClose, bellRef, isAdmin = false }: NotificationDropdownProps) {
  const router = useRouter()
  const { notifications, unreadCount, connected, setNotifications, markRead, markAllRead, setUnreadCount, removeNotification, removeNotifications } = useNotificationStore()

  const dropdownRef = useRef<HTMLDivElement>(null)

  const [loading,     setLoading]     = useState(false)
  const [cursor,      setCursor]      = useState<string | null>(null)
  const [hasMore,     setHasMore]     = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [topPx,       setTopPx]       = useState(80)

  // Select mode
  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [deleting,     setDeleting]     = useState(false)

  // ── Position ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !bellRef.current) return
    const rect = bellRef.current.getBoundingClientRect()
    const panelMaxH = window.innerHeight * 0.8
    const clampedTop = Math.min(rect.top, window.innerHeight - panelMaxH - 16)
    setTopPx(Math.max(0, clampedTop))
  }, [isOpen, bellRef])

  // ── Outside click ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (!dropdownRef.current?.contains(t) && !bellRef.current?.contains(t)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [isOpen, bellRef, onClose])

  // ── Escape ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    function handle(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, onClose])

  // ── Reset select mode on close ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) { setSelectMode(false); setSelectedIds(new Set()) }
  }, [isOpen])

  // ── Fetch ─────────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/notifications?limit=20', { credentials: 'include' })
      if (!res.ok) return
      const json = (await res.json()) as NotificationsApiResponse
      const { items, nextCursor, unreadCount: count } = json.data
      setNotifications(items); setUnreadCount(count); setCursor(nextCursor); setHasMore(nextCursor !== null)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [setNotifications, setUnreadCount])

  useEffect(() => { if (isOpen) void fetchNotifications() }, [isOpen, fetchNotifications])

  // ── Load more ─────────────────────────────────────────────────────────

  async function handleLoadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res  = await fetch(`/api/notifications?limit=20&cursor=${encodeURIComponent(cursor)}`, { credentials: 'include' })
      if (!res.ok) return
      const json = (await res.json()) as NotificationsApiResponse
      const { items, nextCursor } = json.data
      setNotifications([...notifications, ...items]); setCursor(nextCursor); setHasMore(nextCursor !== null)
    } catch { /* silent */ }
    finally { setLoadingMore(false) }
  }

  // ── Mark all read ─────────────────────────────────────────────────────

  async function handleMarkAllRead() {
    if (unreadCount === 0) return
    try {
      await fetch('/api/notifications/read-all', { method: 'PATCH', credentials: 'include' })
      markAllRead()
    } catch { /* optimistic */ }
  }

  // ── Mark single read ──────────────────────────────────────────────────

  async function handleRead(id: string) {
    markRead(id)
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      })
    } catch { /* optimistic */ }
  }

  // ── Delete single ─────────────────────────────────────────────────────

  async function handleDeleteOne(id: string) {
    removeNotification(id) // optimistic
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE', credentials: 'include' })
    } catch { void fetchNotifications() } // revert on error
  }

  // ── Delete selected ───────────────────────────────────────────────────

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return
    const ids = [...selectedIds]
    setDeleting(true)
    removeNotifications(ids) // optimistic
    setSelectedIds(new Set()); setSelectMode(false)
    try {
      await fetch('/api/notifications', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
    } catch { void fetchNotifications() }
    finally { setDeleting(false) }
  }

  // ── Select toggle ─────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(notifications.map((n) => n.id)))
  }

  function deselectAll() { setSelectedIds(new Set()) }

  function handleNavigate(linkTo: string) { onClose(); router.push(linkTo) }

  if (!isOpen) return null

  const allSelected = selectedIds.size === notifications.length && notifications.length > 0

  return (
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', left: '240px', top: `${topPx}px`, width: '380px', maxHeight: '80vh', zIndex: 100, boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
      className="flex flex-col bg-background-secondary border border-border-default overflow-hidden"
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border-default shrink-0">
        {selectMode ? (
          // Select mode header
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={allSelected ? deselectAll : selectAll}
                className="font-mono text-[10px] tracking-widest text-text-muted hover:text-accent transition-colors">
                {allSelected ? 'DESELECT ALL' : 'SELECT ALL'}
              </button>
              {selectedIds.size > 0 && (
                <span className="font-mono text-[10px] text-text-muted">{selectedIds.size} selected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button type="button" onClick={() => void handleDeleteSelected()} disabled={deleting}
                  className="font-mono text-[10px] tracking-widest text-status-danger hover:opacity-80 transition-opacity disabled:opacity-40">
                  {deleting ? 'DELETING…' : `DELETE (${selectedIds.size})`}
                </button>
              )}
              <button type="button" onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
                className="font-mono text-[10px] tracking-widest text-text-muted hover:text-accent transition-colors">
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          // Normal header
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-text-muted tracking-widest">NOTIFICATIONS</span>
            <div className="flex items-center gap-3">
              <span className={['font-mono text-[10px] tracking-widest', connected ? 'text-status-success' : 'text-text-muted'].join(' ')}>
                {connected ? '● LIVE' : '○ POLLING'}
              </span>
              {notifications.length > 0 && (
                <button type="button" onClick={() => setSelectMode(true)}
                  className="font-mono text-[10px] tracking-widest text-text-muted hover:text-accent transition-colors">
                  SELECT
                </button>
              )}
              <button type="button" onClick={() => void handleMarkAllRead()} disabled={unreadCount === 0}
                className={['font-mono text-[10px] tracking-widest transition-colors', unreadCount > 0 ? 'text-text-muted hover:text-accent cursor-pointer' : 'text-text-muted opacity-40 cursor-not-allowed'].join(' ')}>
                MARK ALL READ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <><ShimmerRow /><ShimmerRow /><ShimmerRow /></>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-text-muted text-2xl">◉</span>
            <span className="font-mono text-xs text-text-muted tracking-widest">ALL CAUGHT UP</span>
          </div>
        ) : (
          <>
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={(id) => void handleRead(id)}
                onNavigate={handleNavigate}
                onDelete={(id) => void handleDeleteOne(id)}
                selectable={selectMode}
                selected={selectedIds.has(n.id)}
                onSelect={toggleSelect}
              />
            ))}

            {hasMore && (
              <div className="flex justify-center mx-4 my-3">
                <button type="button" onClick={() => void handleLoadMore()} disabled={loadingMore}
                  className="font-mono text-xs text-text-muted border border-border-default px-4 py-2 tracking-widest hover:border-accent hover:text-accent transition-colors disabled:opacity-40">
                  {loadingMore ? 'LOADING…' : 'LOAD MORE'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Admin Broadcast ───────────────────────────────────────────── */}
      {isAdmin && <AdminBroadcastPanel />}
    </div>
  )
}
