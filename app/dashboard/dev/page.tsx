'use client'

/**
 * HIDDEN developer dashboard — /dashboard/dev
 *
 * Not linked from any nav. Server-side access is gated by the
 * DEV_DASHBOARD_EMAILS allowlist (see /api/dev/forgie-usage). If the logged-in
 * user isn't on the allowlist the API returns 404 and we bounce to /dashboard.
 *
 * Shows a name card per user with their Forgie usage; clicking a card opens a
 * panel with every web + WhatsApp conversation transcript and every action
 * Forgie executed on their behalf.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/hooks/useAuth'

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  whatsappNumber: string | null
  isActive: boolean
  webConversations: number
  waConversations: number
  webMessages: number
  waMessages: number
  actions: number
  lastActiveAt: string | null
}

interface Message {
  id: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL'
  content: string
  provider: string | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
}

interface Conversation {
  id: string
  channel: 'WEB' | 'WHATSAPP'
  title: string | null
  isPinned: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  messages: Message[]
}

interface ActionLog {
  id: string
  action: string
  args: unknown
  result: unknown
  success: boolean
  error: string | null
  createdAt: string
}

interface Detail {
  user: { id: string; name: string; email: string; role: string; whatsappNumber: string | null }
  conversations: Conversation[]
  actions: ActionLog[]
}

export default function DevDashboardPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [denied, setDenied] = useState(false)
  const [selected, setSelected] = useState<UserRow | null>(null)

  useEffect(() => {
    if (loading || !user) return
    void (async () => {
      try {
        const res = await fetch('/api/dev/forgie-usage', { credentials: 'include' })
        if (res.status === 404 || res.status === 403) {
          setDenied(true)
          router.replace('/dashboard')
          return
        }
        const json = (await res.json()) as { data?: { users: UserRow[] } }
        setRows(json.data?.users ?? [])
      } catch {
        setDenied(true)
      }
    })()
  }, [loading, user, router])

  if (loading || (!rows && !denied)) {
    return <div className="p-8 text-sm text-[#999]">Loading…</div>
  }
  if (denied) return null

  const totalUsers = rows?.length ?? 0
  const totalChats = (rows ?? []).reduce((s, r) => s + r.webConversations + r.waConversations, 0)
  const totalActions = (rows ?? []).reduce((s, r) => s + r.actions, 0)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Forgie — Developer Console</h1>
          <span className="text-[10px] font-mono uppercase tracking-widest bg-[#1A1A1A] text-white px-2 py-0.5 rounded">
            hidden
          </span>
        </div>
        <p className="text-sm text-[#666] mt-1">
          Every user's Forgie activity — web &amp; WhatsApp chats and the actions Forgie ran for them.
          Visible only to allowlisted developer accounts.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Users" value={totalUsers} />
        <StatCard label="Total conversations" value={totalChats} />
        <StatCard label="AI-executed actions" value={totalActions} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(rows ?? []).map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            className="text-left bg-white border border-black/10 rounded-lg p-4 hover:border-black/30 hover:shadow-sm transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[#1A1A1A] truncate">{r.name}</p>
                <p className="text-xs text-[#999] truncate">{r.email}</p>
              </div>
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-[#666]">
                {r.role.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <Metric label="Web" value={r.webConversations} sub={`${r.webMessages} msg`} />
              <Metric label="WhatsApp" value={r.waConversations} sub={`${r.waMessages} msg`} />
              <Metric label="Actions" value={r.actions} sub="ran" />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-[#999]">
              <span>{r.whatsappNumber ?? 'no WA number'}</span>
              <span>{r.lastActiveAt ? `active ${relative(r.lastActiveAt)}` : 'never used'}</span>
            </div>
            {!r.isActive && (
              <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                inactive
              </span>
            )}
          </button>
        ))}
      </div>

      {selected && <DetailPanel row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ─── Detail slide-over ─────────────────────────────────────────────────────────

function DetailPanel({ row, onClose }: { row: UserRow; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [tab, setTab] = useState<'WEB' | 'WHATSAPP' | 'ACTIONS'>('WEB')
  const [openConv, setOpenConv] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/dev/forgie-usage/${row.id}`, { credentials: 'include' })
      const json = (await res.json()) as { data?: Detail }
      setDetail(json.data ?? null)
    })()
  }, [row.id])

  const convs = detail?.conversations ?? []
  const webConvs = convs.filter((c) => c.channel === 'WEB')
  const waConvs = convs.filter((c) => c.channel === 'WHATSAPP')
  const shown = tab === 'WEB' ? webConvs : tab === 'WHATSAPP' ? waConvs : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#F7F7F2] h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-[#F7F7F2] border-b border-black/10 px-5 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A1A1A]">{row.name}</h2>
            <p className="text-xs text-[#999]">{row.email}{row.whatsappNumber ? ` · ${row.whatsappNumber}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-black text-xl leading-none">×</button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          <Tab active={tab === 'WEB'} onClick={() => setTab('WEB')}>Web ({webConvs.length})</Tab>
          <Tab active={tab === 'WHATSAPP'} onClick={() => setTab('WHATSAPP')}>WhatsApp ({waConvs.length})</Tab>
          <Tab active={tab === 'ACTIONS'} onClick={() => setTab('ACTIONS')}>Actions ({detail?.actions.length ?? 0})</Tab>
        </div>

        <div className="px-5 py-4">
          {!detail && <p className="text-sm text-[#999]">Loading…</p>}

          {detail && tab !== 'ACTIONS' && shown.length === 0 && (
            <p className="text-sm text-[#999]">No {tab === 'WEB' ? 'web' : 'WhatsApp'} conversations.</p>
          )}

          {detail && tab !== 'ACTIONS' && shown.map((c) => (
            <div key={c.id} className="mb-3 bg-white border border-black/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenConv(openConv === c.id ? null : c.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-black/[0.02]"
              >
                <span className="text-sm font-medium text-[#1A1A1A] truncate">
                  {c.title || 'Untitled conversation'}
                </span>
                <span className="shrink-0 text-[11px] text-[#999]">
                  {c.messages.length} msg · {relative(c.updatedAt)}
                </span>
              </button>
              {openConv === c.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
                  {c.messages.map((m) => (
                    <MessageBubble key={m.id} m={m} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {detail && tab === 'ACTIONS' && (
            detail.actions.length === 0 ? (
              <p className="text-sm text-[#999]">Forgie hasn't run any actions for this user.</p>
            ) : (
              <div className="space-y-2">
                {detail.actions.map((a) => (
                  <div key={a.id} className="bg-white border border-black/10 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={['w-2 h-2 rounded-full', a.success ? 'bg-emerald-500' : 'bg-red-500'].join(' ')} />
                      <span className="text-sm font-medium">{a.action.replace(/_/g, ' ')}</span>
                      <span className="ml-auto text-[11px] text-[#999]">{relative(a.createdAt)}</span>
                    </div>
                    {a.error && <p className="text-xs text-red-600 mt-1">{a.error}</p>}
                    <pre className="mt-2 text-[11px] text-[#555] bg-black/[0.03] rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                      {safeJson(a.args)}
                    </pre>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ m }: { m: Message }) {
  const isUser = m.role === 'USER'
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={[
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isUser ? 'bg-[#1A1A1A] text-white' : 'bg-black/[0.04] text-[#1A1A1A]',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[9px] font-mono uppercase tracking-widest opacity-60">
            {m.role}{m.provider ? ` · ${m.provider}` : ''}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
      </div>
    </div>
  )
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-black/10 rounded-lg p-4">
      <p className="text-xs text-[#999] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#1A1A1A]">{value.toLocaleString()}</p>
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="bg-black/[0.03] rounded-md px-2 py-1.5 text-center">
      <p className="text-[10px] font-mono uppercase tracking-wide text-[#999]">{label}</p>
      <p className="text-lg font-bold text-[#1A1A1A] leading-tight">{value}</p>
      <p className="text-[10px] text-[#999]">{sub}</p>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3 py-1.5 text-xs font-mono uppercase tracking-wide rounded-t-md',
        active ? 'bg-white text-[#1A1A1A] border border-black/10 border-b-white' : 'text-[#999] hover:text-[#666]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function relative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.floor((Date.now() - then) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
