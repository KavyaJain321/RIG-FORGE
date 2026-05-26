'use client'

import { useRef, useEffect, type KeyboardEvent } from 'react'

interface ComposerProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  placeholder?: string
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Ask Forgie...',
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-grow vertically up to a max height
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim()) onSubmit()
    }
  }

  return (
    <div className="border-t border-black/10 bg-white p-3">
      <div className="flex items-end gap-2 bg-[#F8F8F4] border border-black/10 rounded-2xl px-3 py-2 focus-within:border-[#1A1A1A] transition-colors">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          maxLength={4000}
          className="flex-1 resize-none bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:outline-none leading-relaxed"
          style={{ maxHeight: '160px' }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className={[
            'shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors',
            disabled || !value.trim()
              ? 'bg-black/10 text-[#999999] cursor-not-allowed'
              : 'bg-[#1A1A1A] text-white hover:bg-[#333]',
          ].join(' ')}
          aria-label="Send message"
        >
          <ArrowIcon />
        </button>
      </div>
      <p className="font-mono text-[10px] text-[#999999] mt-1.5 px-1 tracking-wide">
        Enter to send · Shift+Enter for new line · {value.length}/4000
      </p>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  )
}
