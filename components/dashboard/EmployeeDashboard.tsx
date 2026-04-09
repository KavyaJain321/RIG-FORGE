'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { EmployeeDashboardData, AuthUser, ApiResponse, DailyLogEntry } from '@/lib/types'

interface EmployeeDashboardProps {
  user: AuthUser
}

function timeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDueDate(date: Date | null): string {
  if (!date) return 'No due date'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-neutral-100 text-neutral-500',
  TODO: 'bg-neutral-100 text-neutral-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  COMPLETED_STATUS: 'bg-neutral-100 text-neutral-500',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? 'bg-neutral-100 text-neutral-500'
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}

interface DailyLogSectionProps {
  userId: string
}

function DailyLogSection({ userId: _userId }: DailyLogSectionProps) {
  const [logEntry, setLogEntry] = useState<DailyLogEntry | null>(null)
  const [logText, setLogText] = useState('')
  const [logNotes, setLogNotes] = useState('')
  const [logLoading, setLogLoading] = useState(true)
  const [logSaving, setLogSaving] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    async function fetchLog(): Promise<void> {
      try {
        const res = await fetch('/api/daily-log', { credentials: 'include' })
        const json = (await res.json()) as ApiResponse<DailyLogEntry | null>
        if (res.ok && json.data) {
          setLogEntry(json.data)
          setLogText(json.data.workSummary)
          setLogNotes(json.data.notes ?? '')
        }
      } catch {
        // No log yet is fine — just keep empty state
      } finally {
        setLogLoading(false)
      }
    }
    void fetchLog()
  }, [])

  async function handleSaveLog(): Promise<void> {
    if (!logText.trim()) return
    setLogSaving(true)
    setLogError(null)
    try {
      const method = logEntry ? 'PATCH' : 'POST'
      const res = await fetch('/api/daily-log', {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workSummary: logText, notes: logNotes || null }),
      })
      const json = (await res.json()) as ApiResponse<DailyLogEntry>
      if (!res.ok || json.error) {
        setLogError(json.error ?? 'Failed to save log')
        return
      }
      setLogEntry(json.data)
      setIsEditing(false)
    } catch {
      setLogError('Network error — could not save log')
    } finally {
      setLogSaving(false)
    }
  }

  const showForm = logEntry === null || isEditing

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">
          Today&apos;s Log
        </h2>
        {logEntry !== null && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {logLoading ? (
        <div className="shimmer h-24 rounded-xl" />
      ) : showForm ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">
              What did you work on today?
            </label>
            <textarea
              value={logText}
              onChange={e => setLogText(e.target.value)}
              rows={3}
              placeholder="Describe your work for today..."
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={logNotes}
              onChange={e => setLogNotes(e.target.value)}
              rows={2}
              placeholder="Any blockers, notes, or comments..."
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 resize-none"
            />
          </div>
          {logError !== null && (
            <p className="text-xs text-red-600">{logError}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void handleSaveLog() }}
              disabled={logSaving || !logText.trim()}
              className="px-4 py-2 bg-neutral-900 text-white text-xs font-semibold rounded-xl hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {logSaving ? 'Saving...' : 'Save Log'}
            </button>
            {isEditing && (
              <button
                onClick={() => {
                  setIsEditing(false)
                  setLogText(logEntry?.workSummary ?? '')
                  setLogNotes(logEntry?.notes ?? '')
                  setLogError(null)
                }}
                className="px-4 py-2 text-neutral-500 hover:text-neutral-700 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-neutral-50 rounded-xl px-4 py-3">
            <p className="text-sm text-neutral-800 whitespace-pre-wrap">{logEntry.workSummary}</p>
          </div>
          {logEntry.notes && (
            <div className="bg-neutral-50 rounded-xl px-4 py-3">
              <p className="text-xs font-medium text-neutral-400 mb-1">Notes</p>
              <p className="text-sm text-neutral-600 whitespace-pre-wrap">{logEntry.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EmployeeDashboard({ user }: EmployeeDashboardProps) {
  const [data, setData] = useState<EmployeeDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/dashboard/employee', { credentials: 'include' })
      const json = (await res.json()) as ApiResponse<EmployeeDashboardData>
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to load dashboard')
        return
      }
      setData(json.data)
      setError(null)
    } catch {
      setError('Network error — could not load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EAEAE4] p-6 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="shimmer h-10 w-64 rounded" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="shimmer h-24 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="shimmer h-56 rounded-2xl" />
            <div className="shimmer h-56 rounded-2xl" />
          </div>
          <div className="shimmer h-40 rounded-2xl" />
          <div className="shimmer h-48 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#EAEAE4] p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-neutral-400 mb-1">
              My Workspace
            </p>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              {greeting()}, {user.name.split(' ')[0]}!
            </h1>
          </div>
          <span
            className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
              user.currentStatus === 'WORKING'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {user.currentStatus === 'WORKING' ? '● Working' : '○ Not Working'}
          </span>
        </div>

        {/* Error banner */}
        {error !== null && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {data !== null && (
          <>
            {/* Row 1: Stat cards */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="My Open Tasks" value={data.myOpenTasksCount} />
              <StatCard label="My Projects" value={data.myProjectsCount} />
              <StatCard label="My Open Tickets" value={data.myOpenTicketsCount} />
            </div>

            {/* Row 2: My Projects + My Upcoming Tasks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* My Projects */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4 uppercase tracking-wider">
                  My Projects
                </h2>
                {data.myProjects.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-6 text-center">
                    You haven&apos;t been assigned to any projects yet
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.myProjects.map(project => (
                      <li key={project.id}>
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="flex items-center justify-between hover:bg-neutral-50 rounded-xl px-3 py-2.5 -mx-3 transition-colors group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900 truncate">
                                {project.name}
                              </p>
                              {project.isLead && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">
                                  Lead
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusBadge status={project.status} />
                              <span className="text-xs text-neutral-400">{project.myTaskCount} tasks</span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* My Upcoming Tasks */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4 uppercase tracking-wider">
                  My Upcoming Tasks
                </h2>
                {data.myUpcomingTasks.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-6 text-center">No upcoming tasks</p>
                ) : (
                  <ul className="space-y-2">
                    {data.myUpcomingTasks.map(task => (
                      <li key={task.id}>
                        <Link
                          href={`/dashboard/projects/${task.projectId}`}
                          className="block hover:bg-neutral-50 rounded-xl px-3 py-2.5 -mx-3 transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900 truncate flex-1">
                              {task.title}
                            </p>
                            {task.isOverdue && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">
                                Overdue
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <StatusBadge status={task.status} />
                            <span className="text-xs text-neutral-400 truncate">{task.projectName}</span>
                            <span className="text-xs text-neutral-400 ml-auto shrink-0">
                              {formatDueDate(task.dueDate)}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Row 3: My Recent Tickets */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4 uppercase tracking-wider">
                My Recent Tickets
              </h2>
              {data.myRecentTickets.length === 0 ? (
                <p className="text-sm text-neutral-400 py-6 text-center">
                  You haven&apos;t raised any tickets yet
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {data.myRecentTickets.map(ticket => (
                    <Link
                      key={ticket.id}
                      href={`/dashboard/tickets/${ticket.id}`}
                      className="block hover:bg-neutral-50 rounded-xl border border-neutral-100 px-4 py-3 transition-colors group"
                    >
                      <p className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900 truncate mb-2">
                        {ticket.title}
                      </p>
                      <p className="text-xs text-neutral-400 truncate mb-2">{ticket.projectName}</p>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={ticket.status} />
                        <span className="text-[10px] text-neutral-400">{timeAgo(ticket.createdAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Row 4: Today's Log */}
            <DailyLogSection userId={user.id} />
          </>
        )}
      </div>
    </div>
  )
}
