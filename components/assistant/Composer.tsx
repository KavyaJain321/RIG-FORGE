'use client'

import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from 'react'

interface ComposerProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  placeholder?: string
}

interface Member {
  id: string
  name: string
  role: string
  avatarUrl: string | null
}

// A selectable @-mention option: either a real member or the special "all".
interface MentionOption {
  key: string
  label: string // what gets inserted after '@'
  display: string
  subtitle: string
  avatarUrl: string | null
}

// Find an active @-mention being typed: the last '@' before the cursor that
// sits at the start or right after whitespace, with no whitespace between it
// and the cursor. Returns the '@' index and the query typed after it.
function detectMention(text: string, cursor: number): { start: number; query: string } | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === '@') {
      const prev = i === 0 ? ' ' : text[i - 1]
      if (/\s/.test(prev)) return { start: i, query: text.slice(i + 1, cursor) }
      return null
    }
    if (/\s/.test(ch)) return null // hit whitespace before any '@'
  }
  return null
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Ask Forgie...',
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const pendingCursor = useRef<number | null>(null)

  // Load the roster once for the @-picker.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/users?limit=100', { credentials: 'include' })
        const json = (await res.json()) as { data?: { items?: Member[] } }
        setMembers(json.data?.items ?? [])
      } catch {
        /* mentions are a convenience — fail silently */
      }
    })()
  }, [])

  // Auto-grow vertically up to a max height
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  // Restore caret after we programmatically rewrite the text (mention insert).
  useEffect(() => {
    if (pendingCursor.current !== null && ref.current) {
      ref.current.focus()
      ref.current.setSelectionRange(pendingCursor.current, pendingCursor.current)
      pendingCursor.current = null
    }
  }, [value])

  const open = mentionStart !== null

  // Build the option list: "@all" first (when it matches), then members.
  const q = query.toLowerCase()
  const options: MentionOption[] = []
  if ('all'.startsWith(q) || q === '') {
    options.push({
      key: '__all__',
      label: 'all',
      display: '@all',
      subtitle: 'Everyone on the team',
      avatarUrl: null,
    })
  }
  for (const m of members) {
    if (q === '' || m.name.toLowerCase().includes(q)) {
      options.push({
        key: m.id,
        label: m.name,
        display: m.name,
        subtitle: m.role.replace('_', ' ').toLowerCase(),
        avatarUrl: m.avatarUrl,
      })
    }
  }
  const visible = options.slice(0, 8)

  function refreshMention(text: string) {
    const el = ref.current
    const cursor = el ? el.selectionStart : text.length
    const m = detectMention(text, cursor)
    if (m) {
      setMentionStart(m.start)
      setQuery(m.query)
      setActive(0)
    } else {
      setMentionStart(null)
      setQuery('')
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
    refreshMention(e.target.value)
  }

  const select = useCallback(
    (opt: MentionOption) => {
      if (mentionStart === null) return
      const el = ref.current
      const cursor = el ? el.selectionStart : value.length
      const before = value.slice(0, mentionStart)
      const after = value.slice(cursor)
      const inserted = `@${opt.label} `
      const next = before + inserted + after
      pendingCursor.current = (before + inserted).length
      onChange(next)
      setMentionStart(null)
      setQuery('')
    },
    [mentionStart, value, onChange],
  )

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && visible.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (a + 1) % visible.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + visible.length) % visible.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        select(visible[active])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionStart(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim()) onSubmit()
    }
  }

  return (
    <div className="border-t border-black/8 bg-[#FAFAF8] p-3">
      <div className="relative">
        {/* @-mention dropdown */}
        {open && visible.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 w-72 max-h-64 overflow-y-auto bg-white border border-black/10 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] py-1 z-20">
            {visible.map((opt, i) => (
              <button
                key={opt.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(opt)
                }}
                onMouseEnter={() => setActive(i)}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  i === active ? 'bg-black/[0.05]' : 'hover:bg-black/[0.03]',
                ].join(' ')}
              >
                <span
                  className={[
                    'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold',
                    opt.key === '__all__' ? 'bg-[#1A1A1A] text-white' : 'bg-black/[0.08] text-[#444]',
                  ].join(' ')}
                >
                  {opt.key === '__all__' ? '@' : initials(opt.display)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-[#1A1A1A] truncate">{opt.display}</span>
                  <span className="block text-[11px] text-[#999] truncate">{opt.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-white border border-black/10 rounded-2xl px-3 py-2 focus-within:border-black/30 transition-colors duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKey}
            onClick={() => refreshMention(value)}
            onKeyUp={(e) => {
              // keep the picker in sync when navigating with arrows/home/end
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) refreshMention(value)
            }}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            maxLength={4000}
            className="flex-1 resize-none bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#AAAAAA] focus:outline-none leading-relaxed"
            style={{ maxHeight: '160px' }}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className={[
              'shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150',
              disabled || !value.trim()
                ? 'bg-black/6 text-[#AAAAAA] cursor-not-allowed'
                : 'bg-[#1A1A1A] text-white hover:bg-[#2A2A2A] active:scale-95',
            ].join(' ')}
            aria-label="Send message"
          >
            <ArrowIcon />
          </button>
        </div>
      </div>
      <p className="font-mono text-[10px] text-[#999999] mt-1.5 px-1 tracking-wide">
        Enter to send · Shift+Enter for new line · Type <span className="text-[#666]">@</span> to mention · {value.length}/4000
      </p>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
