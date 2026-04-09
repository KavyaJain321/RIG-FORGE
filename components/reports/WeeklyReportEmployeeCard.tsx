'use client'

import { useState } from 'react'

import type { WeeklyReportEmployeeSnapshot } from '@/lib/types'

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

interface WeeklyReportEmployeeCardProps {
  employee: WeeklyReportEmployeeSnapshot
  defaultExpanded?: boolean
}

function formatDateLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateShort(isoDate: string | null): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function getRoleBadgeClass(role: string): string {
  if (role === 'ADMIN') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}

/**
 * Returns ISO date strings for Mon–Sun of the week containing the given weekStart.
 * weekStart is expected to be an ISO date like "2025-04-07".
 */
function getWeekDates(weekStartIso: string): string[] {
  const start = new Date(weekStartIso)
  return WEEK_DAYS.map((_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export function WeeklyReportEmployeeCard({
  employee,
  defaultExpanded = false,
}: WeeklyReportEmployeeCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const now = new Date()
  const activeSet = new Set(employee.activeDays)

  // Derive the week dates from activeDays or fall back to current week
  const weekStartGuess =
    employee.activeDays.length > 0
      ? employee.activeDays.reduce((a, b) => (a < b ? a : b))
      : new Date(
          now.getTime() - ((now.getDay() === 0 ? 6 : now.getDay() - 1) + 7) * 86400000,
        )
          .toISOString()
          .split('T')[0]

  // Find Monday of that week
  const guessDate = new Date(weekStartGuess)
  const dayIdx = guessDate.getDay()
  const diffToMonday = dayIdx === 0 ? -6 : 1 - dayIdx
  const monday = new Date(guessDate)
  monday.setDate(guessDate.getDate() + diffToMonday)
  const mondayIso = monday.toISOString().split('T')[0]

  const weekDates = getWeekDates(mondayIso)

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* ── Collapsed (always visible) ─────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Name + role */}
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <p className="font-semibold text-gray-900 truncate">{employee.name}</p>
              <p className="text-xs text-gray-500 truncate">{employee.email}</p>
            </div>
            <span
              className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${getRoleBadgeClass(employee.role)}`}
            >
              {employee.role}
            </span>
          </div>

          {/* Activity dots (Mon–Fri) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {employee.daysActive}/5 days
            </span>
            <div className="flex gap-1">
              {weekDates.slice(0, 5).map((date, i) => (
                <div
                  key={date}
                  title={WEEK_DAYS[i]}
                  className={`w-3 h-3 rounded-full ${
                    activeSet.has(date) ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-gray-700">
            <span className="font-medium">{employee.tasksCompleted.length}</span> tasks done
          </span>
          <span className="text-gray-700">
            <span className="font-medium">{employee.tasksInProgress.length}</span> in progress
          </span>
          {employee.overdueTasksCount > 0 ? (
            <span className="text-red-600 font-medium">
              {employee.overdueTasksCount} overdue
            </span>
          ) : (
            <span className="text-gray-700">0 overdue</span>
          )}
          <span className="text-gray-500">|</span>
          <span className="text-gray-700">↑{employee.ticketsRaised} raised</span>
          <span className="text-gray-700">✓{employee.ticketsHelped} helped</span>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {expanded ? '▲ Hide' : '▼ Show Details'}
        </button>
      </div>

      {/* ── Expanded ───────────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-6 bg-gray-50">
          {/* Activity dots Mon–Sun with labels */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Activity
            </h3>
            <div className="flex gap-4">
              {weekDates.map((date, i) => (
                <div key={date} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">{WEEK_DAYS[i]}</span>
                  <div
                    className={`w-4 h-4 rounded-full ${
                      activeSet.has(date) ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Tasks Completed */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Tasks Completed This Week
            </h3>
            {employee.tasksCompleted.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No tasks completed this week</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
                    <th className="pb-1 font-medium">Title</th>
                    <th className="pb-1 font-medium">Project</th>
                    <th className="pb-1 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employee.tasksCompleted.map((task) => (
                    <tr key={task.id}>
                      <td className="py-1.5 pr-3 text-gray-800">{task.title}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{task.projectName}</td>
                      <td className="py-1.5 text-gray-600">{formatDateShort(task.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Tasks In Progress */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Tasks In Progress
            </h3>
            {employee.tasksInProgress.length === 0 ? (
              <p className="text-sm text-gray-400 italic">All caught up!</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
                    <th className="pb-1 font-medium">Title</th>
                    <th className="pb-1 font-medium">Project</th>
                    <th className="pb-1 font-medium">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employee.tasksInProgress.map((task) => {
                    const isOverdue =
                      task.dueDate !== null && new Date(task.dueDate) < new Date()
                    return (
                      <tr key={task.id}>
                        <td className="py-1.5 pr-3 text-gray-800">{task.title}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{task.projectName}</td>
                        <td className="py-1.5 flex items-center gap-2">
                          <span className={isOverdue ? 'text-red-600' : 'text-gray-600'}>
                            {formatDateShort(task.dueDate)}
                          </span>
                          {isOverdue && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                              OVERDUE
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Daily Logs */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Daily Logs
            </h3>
            {employee.dailyLogs.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No daily logs this week</p>
            ) : (
              <div className="space-y-4">
                {employee.dailyLogs.map((log) => (
                  <div key={log.date}>
                    <p className="text-sm font-bold text-gray-800">{formatDateLabel(log.date)}</p>
                    <p className="text-sm text-gray-700 mt-1">{log.workSummary}</p>
                    {log.notes && (
                      <p className="text-xs text-gray-400 mt-0.5">{log.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
