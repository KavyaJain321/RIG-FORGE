'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/lib/auth'
import { WeeklyReportEmployeeCard } from '@/components/reports/WeeklyReportEmployeeCard'
import type { WeeklyReportSnapshot, WeeklyReportSummary } from '@/lib/types'

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

  if (user.role !== 'ADMIN') return null

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Employees" value={companyStats.totalEmployees} />
        <StatCard label="Days Active" value={companyStats.totalDaysActive} />
        <StatCard label="Tasks Completed" value={companyStats.totalTasksCompleted} />
        <StatCard
          label="Tickets"
          value={`${companyStats.totalTicketsRaised} raised / ${companyStats.totalTicketsResolved} resolved`}
        />
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-3 mb-6">
        <label htmlFor="sort-mode" className="text-sm font-medium text-gray-700">
          Sort by:
        </label>
        <select
          id="sort-mode"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="activity">By Activity</option>
          <option value="tasks">By Tasks</option>
          <option value="name">By Name</option>
        </select>
      </div>

      {/* Employee Cards */}
      <div className="flex flex-col gap-4">
        {sortedEmployees.map((employee) => (
          <WeeklyReportEmployeeCard key={employee.userId} employee={employee} />
        ))}
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number | string
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
