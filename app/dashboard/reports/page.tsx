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
function nDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── Report type config ───────────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: 'PROJECT' as const,
    label: 'Project Report',
    description: 'Task progress, completion rates & member contributions per project',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 11h8M8 15h5" />
      </svg>
    ),
    badgeClass: 'bg-violet-100 text-violet-700',
    ringClass:  'ring-violet-500',
    activeCard: 'border-violet-500 bg-violet-50',
  },
  {
    id: 'EMPLOYEE' as const,
    label: 'Employee Report',
    description: 'Activity, tasks completed & daily logs per team member',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    badgeClass: 'bg-blue-100 text-blue-700',
    ringClass:  'ring-blue-500',
    activeCard: 'border-blue-500 bg-blue-50',
  },
  {
    id: 'WEEKLY' as const,
    label: 'Weekly Snapshot',
    description: 'Company-wide overview of the previous calendar week',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    badgeClass: 'bg-gray-100 text-gray-600',
    ringClass:  'ring-gray-400',
    activeCard: 'border-gray-500 bg-gray-50',
  },
]

const TYPE_BADGE: Record<string, string> = {
  PROJECT:  'bg-violet-100 text-violet-700',
  EMPLOYEE: 'bg-blue-100 text-blue-700',
  WEEKLY:   'bg-gray-100 text-gray-600',
}

// ─── Generator Form ───────────────────────────────────────────────────────────

interface ProjectOption  { id: string; name: string; status: string }
interface EmployeeOption { id: string; name: string; email: string }

function GeneratorForm({ onGenerated }: { onGenerated: () => void }) {
  const [type, setType]           = useState<'PROJECT' | 'EMPLOYEE' | 'WEEKLY'>('PROJECT')
  const [dateFrom, setDateFrom]   = useState(nDaysAgo(30))
  const [dateTo, setDateTo]       = useState(today())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [projects,  setProjects]  = useState<ProjectOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  useEffect(() => {
    setLoadingOptions(true)
    Promise.all([
      // FIX: removed status=ALL — just fetch without status filter to get all projects
      fetch('/api/projects?limit=100', { credentials: 'include' })
        .then((r) => r.json())
        .then((j: { data?: { items?: ProjectOption[] } }) => setProjects(j.data?.items ?? []))
        .catch(() => {}),

      fetch('/api/users?limit=100', { credentials: 'include' })
        .then((r) => r.json())
        .then((j: { data?: { items?: EmployeeOption[] } }) => setEmployees(j.data?.items ?? []))
        .catch(() => {}),
    ]).finally(() => setLoadingOptions(false))
  }, [])

  // reset selection when type changes
  useEffect(() => { setSelectedIds([]); setError(null) }, [type])

  const options: MultiSelectOption[] =
    type === 'PROJECT'
      ? projects.map((p) => ({ id: p.id, label: p.name, sub: p.status }))
      : type === 'EMPLOYEE'
        ? employees.map((e) => ({ id: e.id, label: e.name, sub: e.email }))
        : []

  const selectedType = REPORT_TYPES.find((t) => t.id === type)!

  async function handleGenerate() {
    setError(null); setSuccess(false)
    if (type !== 'WEEKLY' && selectedIds.length === 0) {
      setError(`Please select at least one ${type === 'PROJECT' ? 'project' : 'employee'}`)
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
      setSuccess(true)
      setSelectedIds([])
      setTimeout(() => setSuccess(false), 3000)
      onGenerated()
    } catch { setError('Network error — please try again') }
    finally { setGenerating(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-8">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Generate New Report</h2>
        <p className="text-sm text-gray-500 mt-0.5">Choose a type, set filters, and save a snapshot to your history</p>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* ── Type selector cards ────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Report Type</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {REPORT_TYPES.map((t) => {
              const active = type === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all duration-150 ${
                    active
                      ? `${t.activeCard} shadow-sm`
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`inline-flex p-1.5 rounded-lg mb-2.5 ${active ? t.badgeClass : 'bg-gray-100 text-gray-500'}`}>
                    {t.icon}
                  </div>
                  <p className={`text-sm font-semibold mb-0.5 ${active ? 'text-gray-900' : 'text-gray-700'}`}>{t.label}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{t.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Date range ─────────────────────────────────────────────────────── */}
        {type !== 'WEEKLY' && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Date Range</p>
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[150px]">
                <label className="text-xs text-gray-500 block mb-1.5 font-medium">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="text-xs text-gray-500 block mb-1.5 font-medium">To</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  max={today()}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Multi-select ───────────────────────────────────────────────────── */}
        {type !== 'WEEKLY' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {type === 'PROJECT' ? 'Projects' : 'Employees'}
              </p>
              {selectedIds.length > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${selectedType.badgeClass}`}>
                  {selectedIds.length} selected
                </span>
              )}
            </div>
            {loadingOptions ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <MultiSelect
                options={options}
                selected={selectedIds}
                onChange={setSelectedIds}
                placeholder={type === 'PROJECT' ? 'Select projects…' : 'Select employees…'}
              />
            )}
          </div>
        )}

        {/* ── Footer: error / success / button ──────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
              generating
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-700 active:scale-95 shadow-sm'
            }`}
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generate Report
              </>
            )}
          </button>

          {error && (
            <div className="flex items-center gap-1.5 text-sm text-red-600">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Report generated and saved!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Report List ──────────────────────────────────────────────────────────────

function ReportList() {
  const [reports, setReports]       = useState<WeeklyReportSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [filterType, setFilterType] = useState<string>('ALL')

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
    } catch { setError('Failed to delete report') }
    finally { setDeletingId(null); setConfirmId(null) }
  }

  const filtered = reports.filter((r) => {
    const matchType   = filterType === 'ALL' || r.reportType === filterType
    const matchSearch = !search || (r.label ?? '').toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="flex items-center gap-2 text-sm text-red-600 py-4">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" /></svg>
      {error}
    </div>
  )

  return (
    <div>
      {/* Toolbar */}
      {reports.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {['ALL', 'PROJECT', 'EMPLOYEE', 'WEEKLY'].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  filterType === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'ALL' ? 'All' : t === 'PROJECT' ? 'Projects' : t === 'EMPLOYEE' ? 'Employees' : 'Weekly'}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-400 shrink-0">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Empty states */}
      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-1">No reports yet</p>
          <p className="text-sm text-gray-400 max-w-xs">Generate your first report using the form above to start building your report history.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-gray-500">No reports match your filters</p>
          <button onClick={() => { setSearch(''); setFilterType('ALL') }} className="mt-2 text-sm text-blue-600 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const typeCfg    = REPORT_TYPES.find((t) => t.id === r.reportType)
            const badgeClass = TYPE_BADGE[r.reportType] ?? TYPE_BADGE.WEEKLY
            const isConf     = confirmId === r.id

            return (
              <div
                key={r.id}
                className="group bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 hover:border-gray-300 hover:shadow-sm transition-all duration-150"
              >
                {/* Left: icon + info */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${badgeClass}`}>
                    {typeCfg?.icon ?? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate leading-snug">
                      {r.label ?? `Report · ${fmtDate(r.weekStart)} – ${fmtDate(r.weekEnd)}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badgeClass}`}>
                        {r.reportType}
                      </span>
                      <span className="text-xs text-gray-400">Generated {fmtDate(r.generatedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isConf ? (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-red-700 font-medium">Delete this report?</span>
                      <button
                        onClick={() => void handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded-md disabled:opacity-50 transition-colors"
                      >
                        {deletingId === r.id ? '…' : 'Delete'}
                      </button>
                      <button onClick={() => setConfirmId(null)} className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/dashboard/reports/${r.id}`}
                        className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        View
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                      <button
                        onClick={() => setConfirmId(r.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete report"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Employee weekly note ─────────────────────────────────────────────────────

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
    fri.setHours(0, 0, 0, 0)
    fetch(`/api/daily-log/me?date=${fri.toISOString()}`, { credentials: 'include' })
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
    fri.setHours(0, 0, 0, 0)
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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Weekly Summary</h1>
      <p className="text-sm text-gray-500 mb-6">Week ending {thisWeekFriday}</p>
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {!editing && entry ? (
          <>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.workSummary}</p>
            <button onClick={() => setEditing(true)} className="mt-4 text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
          </>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              rows={6}
              placeholder="Summarise what you worked on this week…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">{draft.length}/{MAX_NOTE_LENGTH}</span>
              <div className="flex gap-2">
                {editing && <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>}
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || draft.trim().length === 0}
                  className="px-4 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
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
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Generate and manage project & employee reports for any date range</p>
      </div>

      <GeneratorForm onGenerated={() => setListKey((k) => k + 1)} />

      {/* Saved reports heading */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-800">Saved Reports</h2>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

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
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
    </div>
  )

  if (isAdminRole(user.role)) return <AdminReportsSection />
  return <WeeklyNoteSection />
}
