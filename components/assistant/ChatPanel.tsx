'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAssistantStore } from '@/store/assistantStore'
import { useAuthStore } from '@/store/authStore'
import Message from './Message'
import Composer from './Composer'

/**
 * Forgie's chat panel. Slides out from the right edge.
 * Renders in a portal so it sits above everything else.
 */
export default function ChatPanel() {
  const {
    isOpen,
    close,
    conversationId,
    messages,
    isSending,
    error,
    appendUser,
    appendAssistant,
    setSending,
    setError,
    setConversationId,
    reset,
  } = useAssistantStore()

  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const [portalReady, setPortalReady] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => setPortalReady(true), [])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

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

    try {
      const res = await fetch('/api/assistant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId, content }),
      })
      const json = (await res.json()) as {
        data?: {
          conversationId: string
          assistantMessage: {
            content: string
            provider: string | null
            cached?: boolean
            fallback?: boolean
            pendingActions?: Array<{
              actionId: string
              action: string
              args: Record<string, unknown>
              label: string
            }>
          }
        }
        error?: string
      }

      if (!res.ok || !json.data) {
        setError(json.error ?? 'Forgie hit a snag. Try again in a moment.')
        return
      }

      if (!conversationId) setConversationId(json.data.conversationId)

      const pendingActions = (json.data.assistantMessage.pendingActions ?? []).map(
        (a) => ({ ...a, status: 'pending' as const }),
      )

      appendAssistant(json.data.assistantMessage.content, {
        provider: json.data.assistantMessage.provider,
        cached: json.data.assistantMessage.cached ?? false,
        fallback: json.data.assistantMessage.fallback ?? false,
        pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
      })
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  if (!isOpen || !portalReady) return null

  const firstName = user?.name?.split(' ')[0] ?? 'there'

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] bg-white shadow-2xl flex flex-col animate-[slideIn_180ms_ease-out]"
        role="dialog"
        aria-label="Forgie chat"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-xs font-bold">
              F
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-xs tracking-widest text-[#1A1A1A]">FORGIE</span>
              <span className="font-mono text-[10px] text-[#999999]">
                {isSending ? 'thinking...' : 'AI assistant'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={reset}
              title="New conversation"
              className="p-1.5 rounded-full hover:bg-black/5 transition-colors text-[#666]"
              aria-label="Start new conversation"
            >
              <NewChatIcon />
            </button>
            <button
              type="button"
              onClick={close}
              title="Close"
              className="p-1.5 rounded-full hover:bg-black/5 transition-colors text-[#666]"
              aria-label="Close Forgie"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Body — messages */}
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

        {/* Composer */}
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          disabled={isSending}
        />
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )

  return createPortal(content, document.body)
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
      <p className="text-sm text-[#1A1A1A] leading-relaxed">
        Hi {firstName}. I&apos;m Forgie — RIG FORGE&apos;s resident know-it-all
        (in the technical sense, hopefully).
      </p>
      <p className="text-sm text-[#1A1A1A] leading-relaxed">
        I track every project, task, and ticket on the platform. I can also
        summarize status and call out the team&apos;s slow movers. Diplomatically.
      </p>
      <div className="flex flex-col gap-1.5 w-full pt-1">
        <p className="font-mono text-[10px] text-[#999999] tracking-widest">TRY:</p>
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
      className="text-left text-sm text-[#444] bg-[#F8F8F4] hover:bg-[#F0F0EB] border border-black/5 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
    >
      “{text}”
    </button>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2">
      <span className="w-2 h-2 rounded-full bg-[#999999] animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 rounded-full bg-[#999999] animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 rounded-full bg-[#999999] animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
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
