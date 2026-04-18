'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/lib/auth'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/MultiSelect'
import type { WeeklyReportSummary, ApiResponse, DailyLogEntry } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function today() { return new Date().toISOString().split('T')[0] }
function sevenDaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

const TYPE_BADGE: Record<string, string> = {
  PROJECT:  'bg-violet-100 text-violet-700',
  EMPLOYEE: 'bg-blue-100   text-blue-700',
  WEEKLY:   'bg-gray-100   text-gray-600',
}

// ─── Generator Form ───────────────────────────────────────────────────────────

interface ProjectOption  { id: string; name: string }
interface EmployeeOption { id: string; name: string; email: string }

function GeneratorForm({ onGenerated }: { onGenerated: () => void }) {
  const [type, setType]           = useState<'PROJECT' | 'EMPLOYEE' | 'WEEKLY'>('PROJECT')
  const [dateFrom, setDateFrom]   = useState(sevenDaysAgo())
  const [dateTo, setDateTo]       = useState(today())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [projects,  setProjects]  = useState<ProjectOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/projects?status=ALL&limit=100', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { data?: { items?: ProjectOption[] } }) => setProjects(j.data?.items ?? []))
      .catch(() => {})

    void fetch('/api/users?limit=100', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { data?: { items?: EmployeeOption[] } }) => setEmployees(j.data?.items ?? []))
      .catch(() => {})
  }, [])

  // reset selection when type changes
  useEffect(() => { setSelectedIds([]) }, [type])

  const options: MultiSelectOption[] =
    type === 'PROJECT'
      ? projects.map((p) => ({ id: p.id, label: p.name }))
      : type === 'EMPLOYEE'
        ? employees.map((e) => ({ id: e.id, label: e.name, sub: e.email }))
        : []

  async function handleGenerate() {
    setError(null)
    if (type !== 'WEEKLY' && selectedIds.length === 0) {
      setError('Please select at least one item')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, dateFrom, dateTo, filterIds: selectedIds }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Failed to generate'); return }
      onGenerated()
    } catch { setError('Network error') }
    finally { setGenerating(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900 mb-5">Generate New Report</h2>

      {/* Type */}
      <div className="mb-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Report Type</p>
        <div className="flex gap-3 flex-wrap">
          {(['PROJECT', 'EMPLOYEE', 'WEEKLY'] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="reportType" value={t} checked={type === t} onChange={() => setType(t)} className="accent-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                {t === 'PROJECT' ? '📁 Project Report' : t === 'EMPLOYEE' ? '👥 Employee Report' : '📅 Weekly Report'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Date range (hidden for WEEKLY) */}
      {type !== 'WEEKLY' && (
        <div className="mb-5 flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">From</label>
            <input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">To</label>
            <input type="date" value={dateTo} min={dateFrom} max={today()} onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {/* Multi-select */}
      {type !== 'WEEKLY' && (
        <div className="mb-5">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
            {type === 'PROJECT' ? 'Projects' : 'Employees'}
          </label>
          <MultiSelect
            options={options}
            selected={selectedIds}
            onChange={setSelectedIds}
            placeholder={type === 'PROJECT' ? 'Select projects…' : 'Select employees…'}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <button
        onClick={() => void handleGenerate()}
        disabled={generating}
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {generating && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {generating ? 'Generating…' : 'Generate Report'}
      </button>
    </div>
  )
}

// ─── Report List ──────────────────────────────────────────────────────────────

function ReportList() {
  const router = useRouter()
  const [reports, setReports]     = useState<WeeklyReportSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/reports', { credentials: 'include' })
      const body = await res.json() as { data: WeeklyReportSummary[] }
      setReports(body.data ?? [])
    } catch { setError('Failed to load reports') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchReports() }, [fetchReports])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE', credentials: 'include' })
      setReports((prev) => prev.filter((r) => r.id !== id))
    } catch { setError('Failed to delete') }
    finally { setDeletingId(null); setConfirmId(null) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" /></div>
  if (error)   return <p className="text-sm text-red-600">{error}</p>

  if (reports.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-4xl mb-3">📋</p>
      <p className="text-base font-medium text-gray-600">No reports yet</p>
      <p className="text-sm mt-1">Use the form above to generate your first report.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const typeBadge = TYPE_BADGE[r.reportType] ?? TYPE_BADGE.WEEKLY
        const isConfirming = confirmId === r.id
        return (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 hover:border-gray-300 transition-colors">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${typeBadge}`}>
                  {r.reportType}
                </span>
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {r.label ?? `Report · ${fmtDate(r.weekStart)} – ${fmtDate(r.weekEnd)}`}
                </p>
              </div>
              <p className="text-xs text-gray-400">Generated {fmtDate(r.generatedAt)}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/dashboard/reports/${r.id}`}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded-lg transition-colors"
              >
                View →
              </Link>

              {isConfirming ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Delete?</span>
                  <button
                    onClick={() => void handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    className="px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingId === r.id ? '…' : 'Yes'}
                  </button>
                  <button onClick={() => setConfirmId(null)} className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(r.id)}
                  className="px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete report"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Employee weekly note (unchanged for regular employees) ───────────────────

const MAX_NOTE_LENGTH = 2000

function WeeklyNoteSection() {
  const [entry, setEntry]     = useState<DailyLogEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const thisWeekFriday = (() => {
    const now = new Date()
    const day = now.getDay()
    const diff = day <= 5 ? 5 - day : 6
    const fri = new Date(now)
    fri.setDate(now.getDate() + diff)
    return fri.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  useEffect(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = day <= 5 ? 5 - day : 6
    const fri = new Date(now)
    fri.setDate(now.getDate() + diff)
    fri.setHours(0,0,0,0)
    const iso = fri.toISOString()

    fetch(`/api/daily-log/me?date=${iso}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: ApiResponse<DailyLogEntry>) => {
        if (j.data) { setEntry(j.data); setDraft(j.data.workSummary) }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setError(null)
    const now = new Date()
    const day = now.getDay()
    const diff = day <= 5 ? 5 - day : 6
    const fri = new Date(now)
    fri.setDate(now.getDate() + diff)
    fri.setHours(0,0,0,0)
    try {
      const res = await fetch('/api/daily-log', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: fri.toISOString(), workSummary: draft }),
      })
      const j = await res.json() as ApiResponse<DailyLogEntry>
      if (!res.ok) { setError((j as { error: string }).error ?? 'Failed to save'); return }
      setEntry(j.data!); setEditing(false)
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" /></div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Weekly Summary</h1>
      <p className="text-sm text-gray-500 mb-6">Week ending {thisWeekFriday}</p>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {!editing && entry ? (
          <>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.workSummary}</p>
            <button onClick={() => setEditing(true)} className="mt-4 text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
          </>
        ) : (
          <>
            <textarea
              value={draft} onChange={(e) => setDraft(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              rows={6} placeholder="Summarise what you worked on this week…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">{draft.length}/{MAX_NOTE_LENGTH}</span>
              <div className="flex gap-2">
                {editing && <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>}
                <button onClick={() => void handleSave()} disabled={saving || draft.trim().length === 0}
                  className="px-4 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Admin section ────────────────────────────────────────────────────────────

function AdminReportsSection() {
  const [listKey, setListKey] = useState(0)
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports</h1>
      <GeneratorForm onGenerated={() => setListKey((k) => k + 1)} />
      <h2 className="text-base font-semibold text-gray-700 mb-4">Saved Reports</h2>
      <ReportList key={listKey} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  if (loading || !user) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
    </div>
  )

  if (isAdminRole(user.role)) return <AdminReportsSection />
  return <WeeklyNoteSection />
}
