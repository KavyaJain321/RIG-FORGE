'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { AdminDashboardData, AuthUser, ApiResponse } from '@/lib/types'

interface AdminDashboardProps {
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function StatCard({
  label,
  value,
  accent,
  href,
}: {
  label: string
  value: number
  accent?: 'green' | 'amber' | 'blue'
  href?: string
}) {
  const accentClass =
    accent === 'green'
      ? 'text-emerald-600'
      : accent === 'amber'
        ? 'text-amber-600'
        : accent === 'blue'
          ? 'text-blue-600'
          : 'text-neutral-900'

  const content = (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100 hover:shadow-md transition-shadow">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${accentClass}`}>{value}</p>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}

function SkeletonCard() {
  return <div className="shimmer rounded-2xl h-24" />
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/dashboard/admin', { credentials: 'include' })
      const json = (await res.json()) as ApiResponse<AdminDashboardData>
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
    intervalRef.current = setInterval(() => { void fetchData() }, 60000)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EAEAE4] p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="shimmer h-8 w-48 rounded" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="shimmer rounded-2xl h-64" />
            <div className="shimmer rounded-2xl h-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="shimmer rounded-2xl h-64" />
            <div className="shimmer rounded-2xl h-64" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#EAEAE4] p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-neutral-400 mb-1">
              Admin Overview
            </p>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              Dashboard
            </h1>
          </div>
          <button
            onClick={() => { void fetchData() }}
            className="w-8 h-8 rounded-full bg-black/[0.06] hover:bg-black/[0.1] text-neutral-500 hover:text-neutral-800 transition-all flex items-center justify-center text-base"
            title="Refresh"
          >
            ↻
          </button>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Members" value={data.memberStats.total} />
              <StatCard label="Working Now" value={data.memberStats.working} accent="green" />
              <StatCard label="Open Tickets" value={data.openTicketsCount} accent="amber" />
              <StatCard
                label="Pending Onboarding"
                value={data.pendingOnboarding.length}
                accent="blue"
                href="/dashboard/onboarding"
              />
            </div>

            {/* Row 2: Who's Working + Onboarding Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Who's Working — wider col */}
              <div className="lg:col-span-3 bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4 uppercase tracking-wider">
                  Who&apos;s Working
                </h2>
                {data.workingMembers.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-6 text-center">
                    No one is working right now
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.workingMembers.map(member => (
                      <li key={member.id} className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.name}
                              className="w-9 h-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600">
                              {getInitials(member.name)}
                            </div>
                          )}
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-800 truncate">{member.name}</p>
                          <p className="text-xs text-neutral-400 truncate">
                            {member.primaryProject ?? 'No project'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Onboarding Queue */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">
                    Onboarding Queue
                  </h2>
                  <Link
                    href="/dashboard/onboarding"
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Manage
                  </Link>
                </div>
                {data.pendingOnboarding.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-6 text-center">No pending members</p>
                ) : (
                  <>
                    <ul className="space-y-3">
                      {data.pendingOnboarding.slice(0, 5).map(u => (
                        <li key={u.id} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-neutral-800 truncate">{u.name}</p>
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 shrink-0">
                              {u.role}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-400 truncate">{u.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-neutral-400">
                              Joined {timeAgo(u.createdAt)}
                            </span>
                            <span
                              className={`text-[10px] font-medium ${u.hasLoggedIn ? 'text-emerald-600' : 'text-neutral-400'}`}
                            >
                              {u.hasLoggedIn ? '● Has logged in' : '○ Not yet'}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {data.pendingOnboarding.length > 5 && (
                      <Link
                        href="/dashboard/onboarding"
                        className="block mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View all ({data.pendingOnboarding.length}) →
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Row 3: Active Projects + Open Tickets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Active Projects */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4 uppercase tracking-wider">
                  Active Projects
                </h2>
                {data.activeProjects.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-6 text-center">No active projects</p>
                ) : (
                  <ul className="space-y-3">
                    {data.activeProjects.slice(0, 5).map(project => (
                      <li key={project.id}>
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="flex items-center justify-between hover:bg-neutral-50 rounded-xl px-3 py-2 -mx-3 transition-colors group"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900 truncate">
                              {project.name}
                            </p>
                            <p className="text-xs text-neutral-400">
                              Lead: {project.leadName ?? 'Unassigned'}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-xs text-neutral-500">{project.memberCount} members</p>
                            <p className="text-xs text-amber-600 font-medium">
                              {project.openTaskCount} open tasks
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Open Tickets */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">
                    Open Tickets
                  </h2>
                  <Link
                    href="/dashboard/tickets"
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    View all →
                  </Link>
                </div>
                {data.recentOpenTickets.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-6 text-center">No open tickets</p>
                ) : (
                  <ul className="space-y-3">
                    {data.recentOpenTickets.map(ticket => (
                      <li key={ticket.id}>
                        <Link
                          href={`/dashboard/tickets/${ticket.id}`}
                          className="flex items-start justify-between hover:bg-neutral-50 rounded-xl px-3 py-2 -mx-3 transition-colors group"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900 truncate">
                              {ticket.title}
                            </p>
                            <p className="text-xs text-neutral-400 truncate">
                              {ticket.raisedByName} · {ticket.projectName}
                            </p>
                          </div>
                          <span className="text-[10px] text-neutral-400 shrink-0 ml-3 mt-0.5">
                            {timeAgo(ticket.createdAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
