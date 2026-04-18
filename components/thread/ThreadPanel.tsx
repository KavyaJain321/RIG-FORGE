'use client'

import { useMemo } from 'react'

import MessageInput from '@/components/thread/MessageInput'
import MessageRow   from '@/components/thread/MessageRow'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useThread } from '@/hooks/useThread'
import { useAuthStore } from '@/store/authStore'
import { isAdminRole } from '@/lib/auth'
import type { LocalMessage, ThreadType } from '@/components/thread/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface ThreadPanelProps {
  threadType:  ThreadType
  entityId:    string
  projectId:   string
  maxHeight?:  string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayKey(date: Date): string {
  const d = new Date(date as unknown as string)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatDayLabel(date: Date): string {
  return new Date(date as unknown as string)
    .toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase()
}

// ─── Shimmer ─────────────────────────────────────────────────────────────────

function ShimmerRow() {
  return (
    <div className="flex gap-3 py-2">
      <div className="w-6 h-6 shrink-0 forge-shimmer bg-background-tertiary" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-2.5 w-1/3 forge-shimmer bg-background-tertiary" />
        <div className="h-2.5 w-3/4 forge-shimmer bg-background-tertiary" />
      </div>
    </div>
  )
}

// ─── Row list item ────────────────────────────────────────────────────────────

type RowItem =
  | { kind: 'divider'; label: string; key: string }
  | { kind: 'message'; message: LocalMessage; key: string }

// ─── Component ───────────────────────────────────────────────────────────────

export default function ThreadPanel({
  threadType,
  entityId,
  projectId,
  maxHeight = '400px',
}: ThreadPanelProps) {
  const { user } = useAuthStore()
  const isAdmin       = user?.role ? isAdminRole(user.role) : false
  const currentUserId = user?.id ?? ''

  const {
    messages,
    loading,
    nextCursor,
    fetchEarlier,
    sendMessage,
    editMessage,
    deleteMessage,
    scrollRef,
  } = useThread(threadType, entityId, projectId)

  // Build flat list with date-divider rows injected
  const rows = useMemo<RowItem[]>(() => {
    const result: RowItem[] = []
    let lastDay = ''
    for (const msg of messages) {
      const dk = dayKey(msg.createdAt)
      if (dk !== lastDay) {
        result.push({ kind: 'divider', label: formatDayLabel(msg.createdAt), key: `div-${dk}` })
        lastDay = dk
      }
      result.push({ kind: 'message', message: msg, key: msg.id })
    }
    return result
  }, [messages])

  // Count only non-optimistic messages for the header
  const realCount = messages.filter((m) => !m.optimistic).length

  return (
    <div className="flex flex-col border-t border-border-default pt-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-muted tracking-widest">
          THREAD 
        </span>
        <span className="font-mono text-[10px] text-muted">({realCount})</span>
      </div>

      {/* ── Messages area ──────────────────────────────────────────── */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight }}>
        {/* Load earlier */}
        {nextCursor && !loading && (
          <div className="text-center mb-3">
            <Button onClick={() => void fetchEarlier()} variant="subtle" size="sm">
              LOAD EARLIER
            </Button>
          </div>
        )}

        {loading ? (
          /* Shimmer */
          <div className="space-y-1">
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
          </div>
        ) : messages.length === 0 ? (
          /* Empty state */
          <EmptyState title="NO MESSAGES YET " subline="Be the first to leave a note." />
        ) : (
          /* Message rows + date dividers */
          <div>
            {rows.map((row) => {
              if (row.kind === 'divider') {
                return (
                  <div key={row.key} className="font-mono text-[10px] text-muted text-center my-3">
                    ─── {row.label} ───
                  </div>
                )
              }
              return (
                <MessageRow
                  key={row.key}
                  message={row.message}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ── Input ──────────────────────────────────────────────────── */}
      <div className="border-t border-border-default pt-3 mt-3">
        <MessageInput onSend={(content, opts) => sendMessage(content, opts)} />
      </div>
    </div>
  )
}
