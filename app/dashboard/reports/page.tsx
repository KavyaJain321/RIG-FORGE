'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { useAuth } from '@/hooks/useAuth'
import type { WeeklyReportSummary } from '@/lib/types'

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

export default function ReportsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  const [reports, setReports] = useState<WeeklyReportSummary[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && user && user.role !== 'ADMIN') {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!loading && user?.role === 'ADMIN') {
      fetchReports()
    }
  }, [loading, user])

  async function fetchReports() {
    setFetchError(null)
    try {
      const res = await fetch('/api/reports')
      if (!res.ok) {
        const body = await res.json()
        setFetchError(body.error ?? 'Failed to load reports')
        return
      }
      const body = await res.json()
      setReports(body.data as WeeklyReportSummary[])
    } catch {
      setFetchError('Network error loading reports')
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/reports/generate', { method: 'POST' })
      const body = await res.json()
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

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (user.role !== 'ADMIN') return null

  const alreadyGenerated = isCurrentWeekAlreadyGenerated(reports)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Weekly Reports</h1>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleGenerate}
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

      {/* Error */}
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
