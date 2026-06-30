'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { EmployeeDashboardData, AuthUser, ApiResponse } from '@/lib/types'
import DailyLogDraftCard from '@/components/assistant/DailyLogDraftCard'
import StandupCard from '@/components/assistant/StandupCard'
import SetupPrompt from '@/components/dashboard/SetupPrompt'

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
  CANCELLED: 'bg-surface-highlight text-text-muted',
  TODO: 'bg-surface-highlight text-text-secondary',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  COMPLETED_STATUS: 'bg-surface-highlight text-text-muted',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? 'bg-surface-highlight text-text-muted'
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-raised rounded-2xl p-5 shadow-sm border border-border-subtle">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-bold text-text-primary">{value}</p>
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
      <div className="min-h-screen bg-background-primary p-6 md:p-8">
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-primary p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        <SetupPrompt />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-text-muted mb-1">
              My Workspace
            </p>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
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

        {/* Forgie auto-generated cards */}
        <StandupCard />
        <DailyLogDraftCard />

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
              <div className="bg-surface-raised rounded-2xl p-5 shadow-sm border border-border-subtle">
                <h2 className="text-sm font-semibold text-text-secondary mb-4 uppercase tracking-wider">
                  My Projects
                </h2>
                {data.myProjects.length === 0 ? (
                  <p className="text-sm text-text-muted py-6 text-center">
                    You haven&apos;t been assigned to any projects yet
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.myProjects.map(project => (
                      <li key={project.id}>
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="flex items-center justify-between hover:bg-surface-highlight rounded-xl px-3 py-2.5 -mx-3 transition-colors group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-text-primary group-hover:text-text-primary truncate">
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
                              <span className="text-xs text-text-muted">{project.myTaskCount} tasks</span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* My Upcoming Tasks */}
              <div className="bg-surface-raised rounded-2xl p-5 shadow-sm border border-border-subtle">
                <h2 className="text-sm font-semibold text-text-secondary mb-4 uppercase tracking-wider">
                  My Upcoming Tasks
                </h2>
                {data.myUpcomingTasks.length === 0 ? (
                  <p className="text-sm text-text-muted py-6 text-center">No upcoming tasks</p>
                ) : (
                  <ul className="space-y-2">
                    {data.myUpcomingTasks.map(task => (
                      <li key={task.id}>
                        <Link
                          href={`/dashboard/projects/${task.projectId}`}
                          className="block hover:bg-surface-highlight rounded-xl px-3 py-2.5 -mx-3 transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-text-primary group-hover:text-text-primary truncate flex-1">
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
                            <span className="text-xs text-text-muted truncate">{task.projectName}</span>
                            <span className="text-xs text-text-muted ml-auto shrink-0">
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
            <div className="bg-surface-raised rounded-2xl p-5 shadow-sm border border-border-subtle">
              <h2 className="text-sm font-semibold text-text-secondary mb-4 uppercase tracking-wider">
                My Recent Tickets
              </h2>
              {data.myRecentTickets.length === 0 ? (
                <p className="text-sm text-text-muted py-6 text-center">
                  You haven&apos;t raised any tickets yet
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {data.myRecentTickets.map(ticket => (
                    <Link
                      key={ticket.id}
                      href={`/dashboard/tickets/${ticket.id}`}
                      className="block hover:bg-surface-highlight rounded-xl border border-border-subtle px-4 py-3 transition-colors group"
                    >
                      <p className="text-sm font-medium text-text-primary group-hover:text-text-primary truncate mb-2">
                        {ticket.title}
                      </p>
                      <p className="text-xs text-text-muted truncate mb-2">{ticket.projectName}</p>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={ticket.status} />
                        <span className="text-[10px] text-text-muted">{timeAgo(ticket.createdAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
