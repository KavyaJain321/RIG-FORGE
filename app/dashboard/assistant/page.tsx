'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/lib/auth'

interface Stats {
  totals: { conversations: number; messages: number; auditEntries: number }
  topUsers: Array<{
    userId: string
    name: string
    role: string
    messageCount: number
    inputTokens: number
    outputTokens: number
  }>
  byProvider: Array<{
    provider: string
    messageCount: number
    inputTokens: number
    outputTokens: number
  }>
  recentAudit: Array<{
    id: string
    userName: string
    action: string
    success: boolean
    error: string | null
    createdAt: string
  }>
}

export default function AssistantAdminPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Gate to admins only
  useEffect(() => {
    if (!loading && user && !isAdminRole(user.role)) {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  // Load stats once authenticated
  useEffect(() => {
    if (loading || !user || !isAdminRole(user.role)) return
    void (async () => {
      try {
        const res = await fetch('/api/assistant/admin/stats', { credentials: 'include' })
        const json = (await res.json()) as { data?: Stats; error?: string }
        if (!res.ok || !json.data) {
          setError(json.error ?? 'Failed to load stats')
          return
        }
        setStats(json.data)
      } catch {
        setError('Network error')
      }
    })()
  }, [loading, user])

  if (loading || !user) {
    return <div className="p-8 text-sm text-text-muted">Loading...</div>
  }
  if (!isAdminRole(user.role)) return null
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      </div>
    )
  }
  if (!stats) {
    return <div className="p-8 text-sm text-text-muted">Loading stats...</div>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Forgie — Usage Dashboard</h1>
        <p className="text-sm text-[#555555] mt-1">
          Monitor AI assistant adoption, provider distribution, and recent
          actions executed on the team's behalf.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Conversations" value={stats.totals.conversations} />
        <StatCard label="Total Messages" value={stats.totals.messages} />
        <StatCard label="AI-Executed Actions" value={stats.totals.auditEntries} />
      </div>

      {/* By provider */}
      <Section title="Provider distribution (last 7 days)">
        {stats.byProvider.length === 0 ? (
          <Empty>No assistant traffic yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-widest text-[#646464]">
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2 text-right">Messages</th>
                <th className="px-3 py-2 text-right">Input tokens</th>
                <th className="px-3 py-2 text-right">Output tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {stats.byProvider.map((p) => (
                <tr key={p.provider}>
                  <td className="px-3 py-2 font-medium">{p.provider}</td>
                  <td className="px-3 py-2 text-right">{p.messageCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-[#555555]">
                    {p.inputTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-[#555555]">
                    {p.outputTokens.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Top users */}
      <Section title="Top users (last 7 days)">
        {stats.topUsers.length === 0 ? (
          <Empty>No activity yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-widest text-[#646464]">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2 text-right">Messages</th>
                <th className="px-3 py-2 text-right">Tokens (in + out)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {stats.topUsers.map((u) => (
                <tr key={u.userId}>
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2 text-xs uppercase tracking-wide text-[#555555]">
                    {u.role.replace('_', ' ')}
                  </td>
                  <td className="px-3 py-2 text-right">{u.messageCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-[#555555]">
                    {(u.inputTokens + u.outputTokens).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Recent audit log */}
      <Section title="Recent AI-executed actions">
        {stats.recentAudit.length === 0 ? (
          <Empty>No actions yet.</Empty>
        ) : (
          <div className="divide-y divide-black/5">
            {stats.recentAudit.map((a) => (
              <div key={a.id} className="px-3 py-3 flex items-start gap-3">
                <span
                  className={[
                    'shrink-0 w-2 h-2 rounded-full mt-1.5',
                    a.success ? 'bg-emerald-500' : 'bg-red-500',
                  ].join(' ')}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{a.userName}</span>
                    <span className="text-[#555555]"> · {humanAction(a.action)}</span>
                  </p>
                  {a.error && (
                    <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{a.error}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-[#646464] font-mono">
                  {formatTime(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-black/10 rounded-lg p-4">
      <p className="text-xs text-[#646464] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#1A1A1A]">{value.toLocaleString()}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-mono uppercase tracking-widest text-[#555555] mb-3 px-3">
        {title}
      </h2>
      <div className="bg-white border border-black/10 rounded-lg overflow-x-auto">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm text-[#646464]">{children}</p>
}

function humanAction(action: string): string {
  switch (action) {
    case 'create_task':
      return 'created a task'
    case 'create_ticket':
      return 'raised a ticket'
    case 'update_task_status':
      return 'updated a task status'
    case 'create_project':
      return 'created a project'
    case 'add_project_member':
      return 'added a member to a project'
    case 'set_project_lead':
      return 'changed a project lead'
    case 'gh_create_repo':
      return 'created a GitHub repo'
    case 'gh_create_issue':
      return 'filed a GitHub issue'
    case 'gcal_create_event':
      return 'created a calendar event'
    case 'gcal_cancel_event':
      return 'cancelled a calendar event'
    case 'gmail_send':
      return 'sent an email'
    case 'drive_create_folder':
      return 'created a Drive folder'
    case 'drive_create_doc':
      return 'created a Drive file'
    default:
      return action.replace(/_/g, ' ')
  }
}

function formatTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
