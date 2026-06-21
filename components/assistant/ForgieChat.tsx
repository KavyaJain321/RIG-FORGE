'use client'

import { useEffect, useRef, useState } from 'react'

import { useAssistantStore } from '@/store/assistantStore'
import { useAuthStore } from '@/store/authStore'
import { APP_NAME_UPPER } from '@/lib/branding'
import Message from './Message'
import Composer from './Composer'
import HistoryView from './HistoryView'

interface ForgieChatProps {
  /** Render the header "X" button. Used by the mobile overlay; the desktop dock is persistent. */
  showClose?: boolean
  /** Called when the "X" button is pressed (only relevant when showClose is true). */
  onClose?: () => void
}

/**
 * Forgie's chat experience — header, chat/history body, and composer.
 * Position-agnostic: fills whatever parent holds it (the persistent dock on
 * desktop, the slide-in overlay on mobile). All streaming/send logic lives here.
 */
export default function ForgieChat({ showClose = false, onClose }: ForgieChatProps) {
  const {
    view,
    conversationId,
    messages,
    isSending,
    error,
    appendUser,
    beginAssistant,
    appendDelta,
    finalizeAssistant,
    setSending,
    setError,
    setView,
    setConversationId,
    reset,
  } = useAssistantStore()

  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, isSending])

  async function handleSend() {
    const content = input.trim()
    if (!content || isSending) return

    setInput('')
    appendUser(content)
    setSending(true)
    setError(null)

    // Create the assistant message up front so we can stream into it
    const assistantId = beginAssistant()

    try {
      const res = await fetch('/api/assistant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId, content }),
      })

      if (!res.ok) {
        // Non-streaming error path (auth, validation, etc.)
        let errBody: { error?: string } | null = null
        try {
          errBody = (await res.json()) as { error?: string }
        } catch { /* ignore */ }
        setError(errBody?.error ?? `Forgie returned HTTP ${res.status}.`)
        finalizeAssistant(assistantId, { content: '', fallback: true })
        return
      }

      // NDJSON streaming path
      if (!res.body) {
        setError('No response stream received.')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalMeta: Record<string, unknown> | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process any complete lines
        let newlineIdx = buffer.indexOf('\n')
        while (newlineIdx >= 0) {
          const line = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 1)
          newlineIdx = buffer.indexOf('\n')
          if (!line) continue

          try {
            const frame = JSON.parse(line) as Record<string, unknown>
            if (frame.type === 'start' && typeof frame.conversationId === 'string') {
              if (!conversationId) setConversationId(frame.conversationId)
            } else if (frame.type === 'text' && typeof frame.delta === 'string') {
              appendDelta(assistantId, frame.delta)
            } else if (frame.type === 'done') {
              finalMeta = frame
            } else if (frame.type === 'error' && typeof frame.error === 'string') {
              setError(frame.error)
            }
          } catch {
            // Malformed line — skip
          }
        }
      }

      // Finalize with the done frame's metadata
      if (finalMeta) {
        const rawActions = (finalMeta.pendingActions ?? []) as Array<{
          actionId: string
          action: string
          args: Record<string, unknown>
          token?: string
          label: string
        }>
        const pendingActions = rawActions.map((a) => ({
          ...a,
          status: 'pending' as const,
        }))
        finalizeAssistant(assistantId, {
          provider: (finalMeta.provider ?? null) as string | null,
          cached: Boolean(finalMeta.cached),
          fallback: Boolean(finalMeta.fallback),
          pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
        })
      }
    } catch {
      setError('Network error. Check your connection and try again.')
      finalizeAssistant(assistantId, { fallback: true })
    } finally {
      setSending(false)
    }
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-xs font-bold">
            F
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-xs tracking-widest text-text-primary">FORGIE</span>
            <span className="font-mono text-[10px] text-text-muted">
              {isSending ? 'thinking...' : 'AI assistant'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            title={view === 'history' ? 'Back to chat' : 'Conversation history'}
            className={[
              'p-1.5 rounded-full transition-colors',
              view === 'history' ? 'bg-black/10 text-text-primary' : 'hover:bg-text-primary/[0.06] text-text-secondary',
            ].join(' ')}
            aria-label="Conversation history"
          >
            <HistoryIcon />
          </button>
          <button
            type="button"
            onClick={reset}
            title="New conversation"
            className="p-1.5 rounded-full hover:bg-text-primary/[0.06] transition-colors text-text-secondary"
            aria-label="Start new conversation"
          >
            <NewChatIcon />
          </button>
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-1.5 rounded-full hover:bg-text-primary/[0.06] transition-colors text-text-secondary"
              aria-label="Close Forgie"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {/* Body — chat or history */}
      {view === 'history' ? (
        <HistoryView />
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.length === 0 ? (
              <EmptyState firstName={firstName} />
            ) : (
              messages.map((m) => (
                <Message key={m.id} msg={m} conversationId={conversationId} />
              ))
            )}

            {isSending && <TypingIndicator />}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                {error}
              </div>
            )}
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            disabled={isSending}
          />
        </>
      )}
    </div>
  )
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function EmptyState({ firstName }: { firstName: string }) {
  const examples = [
    "What's due this week?",
    "Who's on Childsafe?",
    "Show me my open tickets",
  ]

  return (
    <div className="flex flex-col items-start gap-4 py-2">
      <p className="text-sm text-text-primary leading-relaxed">
        Hi {firstName}. I&apos;m Forgie — {APP_NAME_UPPER}&apos;s resident know-it-all
        (in the technical sense, hopefully).
      </p>
      <p className="text-sm text-text-primary leading-relaxed">
        I track every project, task, and ticket on the platform. I can also
        summarize status and call out the team&apos;s slow movers. Diplomatically.
      </p>
      <div className="flex flex-col gap-1.5 w-full pt-1">
        <p className="font-mono text-[10px] text-text-muted tracking-widest">TRY:</p>
        {examples.map((ex) => (
          <ExampleChip key={ex} text={ex} />
        ))}
      </div>
    </div>
  )
}

function ExampleChip({ text }: { text: string }) {
  const { isSending } = useAssistantStore()
  const handleClick = () => {
    if (isSending) return
    const event = new CustomEvent('forgie-fill', { detail: text })
    window.dispatchEvent(event)
  }

  // For now, just non-interactive examples to avoid wiring up event coupling.
  // Future: tap chip to autofill the composer.
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSending}
      className="text-left text-sm text-text-secondary bg-surface-highlight hover:bg-surface-highlight border border-border-subtle rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
    >
      “{text}”
    </button>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2">
      <span className="w-2 h-2 rounded-full bg-[#646464] animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 rounded-full bg-[#646464] animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 rounded-full bg-[#646464] animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function NewChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}
