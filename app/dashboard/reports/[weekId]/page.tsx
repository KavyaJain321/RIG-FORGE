'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/lib/auth'
import { WeeklyReportEmployeeCard } from '@/components/reports/WeeklyReportEmployeeCard'
import type { WeeklyReportSnapshot, WeeklyReportSummary, WeeklyReportProjectSnapshot } from '@/lib/types'

type SortMode = 'activity' | 'tasks' | 'name'

interface WeeklyReportFull extends WeeklyReportSummary {
  snapshot: WeeklyReportSnapshot
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateFull(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function WeeklyReportDetailPage() {
  const router = useRouter()
  const params = useParams()
  const weekId = params.weekId as string

  const { user, loading } = useAuth()

  const [report, setReport] = useState<WeeklyReportFull | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('activity')

  useEffect(() => {
    if (!loading && user && !isAdminRole(user.role)) {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!loading && user?.role && isAdminRole(user.role) && weekId) {
      fetchReport()
    }
  }, [loading, user, weekId])

  async function fetchReport() {
    setFetchError(null)
    try {
      const res = await fetch(`/api/reports/${weekId}`)
      if (!res.ok) {
        const body = await res.json()
        setFetchError(body.error ?? 'Failed to load report')
        return
      }
      const body = await res.json()
      setReport(body.data as WeeklyReportFull)
    } catch {
      setFetchError('Network error loading report')
    }
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!isAdminRole(user.role)) return null

  if (fetchError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard/reports" className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block">
          ← Back to Reports
        </Link>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {fetchError}
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  const { snapshot } = report
  const { companyStats } = snapshot

  const sortedEmployees = [...snapshot.employees].sort((a, b) => {
    if (sortMode === 'activity') return b.daysActive - a.daysActive
    if (sortMode === 'tasks') return b.tasksCompleted.length - a.tasksCompleted.length
    return a.name.localeCompare(b.name)
  })

  const projects: WeeklyReportProjectSnapshot[] = snapshot.projects ?? []
  const activeProjects  = projects.filter((p) => p.status === 'ACTIVE')
  const otherProjects   = projects.filter((p) => p.status !== 'ACTIVE')

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back */}
      <Link
        href="/dashboard/reports"
        className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 inline-block"
      >
        ← Back to Reports
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Weekly Report: {formatDate(report.weekStart)} – {formatDate(report.weekEnd)}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Generated {formatDateFull(report.generatedAt)}
        </p>
      </div>

      {/* Company Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <StatCard label="Employees"        value={companyStats.totalEmployees} />
        <StatCard label="Active Projects"  value={companyStats.activeProjects ?? activeProjects.length} />
        <StatCard label="Days Active"      value={companyStats.totalDaysActive} />
        <StatCard label="Tasks Done"       value={companyStats.totalTasksCompleted} />
        <StatCard label="Tickets Raised"   value={companyStats.totalTicketsRaised} />
        <StatCard label="Tickets Resolved" value={companyStats.totalTicketsResolved} />
      </div>

      {/* ── Projects Section ──────────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            📁 Project Progress
          </h2>

          {/* Active projects */}
          {activeProjects.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Active ({activeProjects.length})
              </p>
              <div className="flex flex-col gap-3 mb-6">
                {activeProjects.map((p) => (
                  <ProjectRow key={p.projectId} project={p} />
                ))}
              </div>
            </>
          )}

          {/* Other projects */}
          {otherProjects.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Other ({otherProjects.length})
              </p>
              <div className="flex flex-col gap-3">
                {otherProjects.map((p) => (
                  <ProjectRow key={p.projectId} project={p} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Employees Section ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            👥 Employee Activity
          </h2>
          <div className="flex items-center gap-2">
            <label htmlFor="sort-mode" className="text-sm text-gray-600">Sort by:</label>
            <select
              id="sort-mode"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="activity">Activity</option>
              <option value="tasks">Tasks Done</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {sortedEmployees.map((employee) => (
            <WeeklyReportEmployeeCard key={employee.userId} employee={employee} />
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface StatCardProps { label: string; value: number | string }
function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

interface ProjectRowProps { project: WeeklyReportProjectSnapshot }
function ProjectRow({ project: p }: ProjectRowProps) {
  const pct = p.tasksTotal > 0 ? Math.round((p.tasksCompleted / p.tasksTotal) * 100) : 0
  const statusColor: Record<string, string> = {
    ACTIVE:    'bg-green-100 text-green-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
    ON_HOLD:   'bg-yellow-100 text-yellow-700',
    CANCELLED: 'bg-red-100 text-red-700',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        {/* Name + meta */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{p.name}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {p.status.replace('_', ' ')}
            </span>
            {p.tasksOverdue > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {p.tasksOverdue} overdue
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Lead: {p.leadName ?? '—'} · {p.memberCount} member{p.memberCount !== 1 ? 's' : ''}
          </p>
        </div>
        {/* This-week completed badge */}
        {p.completedThisWeek > 0 && (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
            +{p.completedThisWeek} done this week
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-600 w-20 text-right">
          {p.tasksCompleted}/{p.tasksTotal} tasks ({pct}%)
        </span>
      </div>

      {/* Task breakdown */}
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <span>{p.tasksInProgress} in progress</span>
        <span>{p.tasksTotal - p.tasksCompleted - p.tasksInProgress} to-do</span>
      </div>
    </div>
  )
}
