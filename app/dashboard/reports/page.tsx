'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { useAuth } from '@/hooks/useAuth'
import type { WeeklyReportSummary, DailyLogEntry, ApiResponse } from '@/lib/types'

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateShort(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

function isCurrentWeekAlreadyGenerated(reports: WeeklyReportSummary[]): boolean {
  if (reports.length === 0) return false
  const latest = reports[0]
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const currentMonday = new Date(now)
  currentMonday.setDate(now.getDate() - daysToMonday)
  currentMonday.setHours(0, 0, 0, 0)
  const lastMonday = new Date(currentMonday)
  lastMonday.setDate(currentMonday.getDate() - 7)
  const reportWeekStart = new Date(latest.weekStart)
  return reportWeekStart >= lastMonday && reportWeekStart < currentMonday
}

// ─── Employee: Weekly note section ────────────────────────────────────────────

const MAX_NOTE_LENGTH = 2000

function WeeklyNoteSection() {
  const [entry, setEntry]     = useState<DailyLogEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // What Friday this note belongs to — just for display
  const thisWeekFriday = (() => {
    const now = new Date()
    const day = now.getUTCDay()
    const daysSinceMon = day === 0 ? 6 : day - 1
    const friday = new Date(now)
    friday.setUTCDate(now.getUTCDate() - daysSinceMon + 4)
    return friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })()

  const fetchNote = useCallback(async () => {
    try {
      const res  = await fetch('/api/weekly-note', { credentials: 'include' })
      const json = await res.json() as ApiResponse<DailyLogEntry | null>
      if (res.ok && json.data) {
        setEntry(json.data)
        setDraft(json.data.workSummary)
      }
    } catch {
      // Network issue — leave form blank, user can still try to submit
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchNote() }, [fetchNote])

  async function handleSave() {
    const trimmed = draft.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/weekly-note', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })
      const json = await res.json() as ApiResponse<DailyLogEntry>
      if (!res.ok || json.error) {
        setError(json.error ?? 'Could not save note')
        return
      }
      setEntry(json.data)
      setEditing(false)
    } catch {
      setError('Network error — could not save')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(entry?.workSummary ?? '')
    setEditing(false)
    setError(null)
  }

  const showForm = entry === null || editing

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800">Weekly Note</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Week ending {thisWeekFriday} — anything to flag? (optional)
        </p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100">
        {loading ? (
          <div className="space-y-3">
            <div className="shimmer h-4 w-40 rounded" />
            <div className="shimmer h-24 rounded-xl" />
          </div>
        ) : showForm ? (
          <div className="space-y-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              rows={5}
              placeholder="Anything to flag this week? (optional)"
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 resize-none"
            />
            {draft.length > MAX_NOTE_LENGTH - 200 && (
              <p className="text-xs text-neutral-400 text-right">
                {draft.length} / {MAX_NOTE_LENGTH}
              </p>
            )}
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleSave()}
                disabled={saving || !draft.trim()}
                className="px-4 py-2 bg-neutral-900 text-white text-xs font-semibold rounded-xl hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
              {editing && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-neutral-500 hover:text-neutral-700 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Saved state — read-only with edit link */
          <div className="space-y-3">
            <div className="bg-neutral-50 rounded-xl px-4 py-3">
              <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
                {entry.workSummary}
              </p>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Edit note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Admin: Reports list ──────────────────────────────────────────────────────

function AdminReportsSection() {
  const [reports, setReports]           = useState<WeeklyReportSummary[]>([])
  const [fetchError, setFetchError]     = useState<string | null>(null)
  const [generating, setGenerating]     = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setFetchError(null)
    try {
      const res  = await fetch('/api/reports')
      const body = await res.json() as { data: WeeklyReportSummary[]; error?: string }
      if (!res.ok) {
        setFetchError(body.error ?? 'Failed to load reports')
        return
      }
      setReports(body.data)
    } catch {
      setFetchError('Network error loading reports')
    }
  }, [])

  useEffect(() => { void fetchReports() }, [fetchReports])

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      const res  = await fetch('/api/reports/generate', { method: 'POST' })
      const body = await res.json() as { error?: string }
      if (!res.ok) {
        setGenerateError(body.error ?? 'Failed to generate report')
        return
      }
      await fetchReports()
    } catch {
      setGenerateError('Network error generating report')
    } finally {
      setGenerating(false)
    }
  }

  const alreadyGenerated = isCurrentWeekAlreadyGenerated(reports)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Weekly Reports</h1>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => void handleGenerate()}
            disabled={generating || alreadyGenerated}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating && (
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            {generating ? 'Generating…' : "Generate This Week's Report"}
          </button>
          {alreadyGenerated && (
            <p className="text-xs text-gray-500">Report already generated for this week</p>
          )}
          {generateError && (
            <p className="text-xs text-red-600">{generateError}</p>
          )}
        </div>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {fetchError}
        </div>
      )}

      {/* Empty state */}
      {reports.length === 0 && !fetchError && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium mb-1">No reports generated yet.</p>
          <p className="text-sm">Click &quot;Generate&quot; to create the first report.</p>
        </div>
      )}

      {/* Reports list */}
      {reports.length > 0 && (
        <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-medium text-gray-900">
                  Week of {formatDate(report.weekStart)} – {formatDate(report.weekEnd)}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Generated {formatDateShort(report.generatedAt)}
                </p>
              </div>
              <Link
                href={`/dashboard/reports/${report.id}`}
                className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
              >
                View Report →
              </Link>
            </div>
          ))}
        </div>
      )}
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

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (user.role === 'ADMIN') return <AdminReportsSection />
  return <WeeklyNoteSection />
}
