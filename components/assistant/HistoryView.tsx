'use client'

import { useEffect } from 'react'
import { useAssistantStore } from '@/store/assistantStore'

/**
 * Replaces the chat list when view === 'history'. Lists past conversations
 * (most recently updated first), lets the user tap one to switch into it,
 * and offers a "New chat" shortcut.
 */
export default function HistoryView() {
  const {
    conversations,
    conversationsLoaded,
    conversationsLoading,
    loadConversations,
    selectConversation,
    setView,
    reset,
    conversationId: currentId,
  } = useAssistantStore()

  // Load the list when this view mounts (first time only)
  useEffect(() => {
    if (!conversationsLoaded) void loadConversations()
  }, [conversationsLoaded, loadConversations])

  function handleNew() {
    reset()
    setView('chat')
  }

  async function handleSelect(id: string) {
    await selectConversation(id)
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="font-mono text-[10px] tracking-widest text-text-muted">
          PAST CONVERSATIONS
        </span>
        <button
          type="button"
          onClick={handleNew}
          className="font-mono text-[10px] tracking-widest text-text-primary hover:text-accent-ink transition-colors"
        >
          + NEW CHAT
        </button>
      </div>

      {conversationsLoading && conversations.length === 0 && (
        <div className="text-center py-8 font-mono text-xs text-text-muted tracking-wide">
          Loading...
        </div>
      )}

      {conversationsLoaded && conversations.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-text-secondary mb-3">No past conversations yet.</p>
          <button
            type="button"
            onClick={handleNew}
            className="font-mono text-xs tracking-widest text-text-primary underline underline-offset-2"
          >
            START ONE
          </button>
        </div>
      )}

      {conversations.map((c) => {
        const isActive = c.id === currentId
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => void handleSelect(c.id)}
            className={[
              'w-full text-left px-3 py-2.5 rounded-xl transition-colors',
              isActive
                ? 'bg-[#1A1A1A] text-white'
                : 'bg-surface-highlight text-text-primary hover:bg-surface-highlight',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium line-clamp-1 flex-1">
                {c.title ?? 'Untitled conversation'}
              </span>
              {c.isPinned && (
                <span className={`shrink-0 text-[10px] ${isActive ? 'text-white/70' : 'text-text-muted'}`}>
                  ★
                </span>
              )}
            </div>
            <p
              className={`text-[10px] font-mono mt-1 tracking-wide ${
                isActive ? 'text-white/60' : 'text-text-muted'
              }`}
            >
              {c.messageCount} message{c.messageCount === 1 ? '' : 's'} ·{' '}
              {formatRelative(c.updatedAt)}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
