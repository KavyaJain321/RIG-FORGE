'use client'

import { useRef, useState } from 'react'

import Avatar from '@/components/ui/Avatar'
import { useAuthStore } from '@/store/authStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHARS = 2000

// ─── Props ────────────────────────────────────────────────────────────────────

interface MessageInputProps {
  onSend:    (content: string) => Promise<void>
  disabled?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const { user } = useAuthStore()

  const [content,  setContent]  = useState('')
  const [sending,  setSending]  = useState(false)
  const [inputErr, setInputErr] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value)
    setInputErr(null)
    adjustHeight()
  }

  async function handleSubmit() {
    const trimmed = content.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_CHARS) {
      setInputErr(`Message exceeds ${MAX_CHARS} characters`)
      return
    }
    setSending(true)
    setContent('')
    if (textareaRef.current) {
      textareaRef.current.style.height = '36px'
    }
    try {
      await onSend(trimmed)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
    if (e.key === 'Escape') {
      textareaRef.current?.blur()
    }
  }

  const showCharCount  = content.length > 1500
  const charCountClass =
    content.length > 1950
      ? 'text-status-danger'
      : content.length > 1800
      ? 'text-status-warning'
      : 'text-muted'

  const isDisabled = disabled || sending

  return (
    <div className="flex gap-3 items-end">
      {/* Current user avatar */}
      <div className="shrink-0 mb-1">
        <Avatar name={user?.name ?? '?'} avatarUrl={user?.avatarUrl ?? null} size="sm" />
      </div>

      <div className="flex-1 min-w-0">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder="Write a message... (Enter to send, Shift+Enter for new line)"
          rows={1}
          style={{ minHeight: '36px', maxHeight: '96px' }}
          className="bg-background-primary border border-border-default focus:border-accent focus:outline-none font-mono text-xs text-primary placeholder:text-muted placeholder:font-mono placeholder:text-[10px] p-3 w-full resize-none disabled:opacity-50"
        />

        {inputErr && (
          <p className="font-mono text-[10px] text-status-danger mt-1">{inputErr}</p>
        )}

        <div className="flex items-center justify-end gap-3 mt-1">
          {showCharCount && (
            <span className={`font-mono text-[10px] ${charCountClass}`}>
              {content.length} / {MAX_CHARS}
            </span>
          )}
          {content.length > 0 && (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isDisabled}
              className="font-mono text-[10px] text-accent hover:underline disabled:opacity-50"
            >
              ▸ SEND
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
