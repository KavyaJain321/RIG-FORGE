'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/lib/auth'
import type { ApiResponse } from '@/lib/types'
import type { ProfileResponse } from '@/app/api/users/me/profile/route'

// ─── Day labels ────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Status badge color ────────────────────────────────────────────────────

function projectStatusClass(status: string): string {
  switch (status) {
    case 'ACTIVE':    return 'text-status-success border-status-success'
    case 'ON_HOLD':   return 'text-status-warning border-status-warning'
    case 'COMPLETED': return 'text-accent border-accent'
    default:          return 'text-text-muted border-border-default'
  }
}

// ─── Initials avatar ───────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ─── Date formatting ───────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatMemberSince(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-background-secondary border border-border-default p-6 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-background-tertiary forge-shimmer rounded"
          style={{ width: `${70 + (i % 3) * 10}%` }}
        />
      ))}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [profileData, setProfileData] = useState<ProfileResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Daily log state
  const [todayLogText, setTodayLogText] = useState('')
  const [todayLogNotes, setTodayLogNotes] = useState('')
  const [logSaving, setLogSaving] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  // Password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  // ── Redirect admins ───────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && user?.role && isAdminRole(user.role)) {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  // ── Fetch profile data ────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true)
    setProfileError(null)
    try {
      const res = await fetch('/api/users/me/profile', { credentials: 'include' })
      const json = (await res.json()) as ApiResponse<ProfileResponse>
      if (!res.ok || !json.data) {
        setProfileError(json.error ?? 'Failed to load profile')
        return
      }
      setProfileData(json.data)
    } catch {
      setProfileError('Failed to load profile')
    } finally {
      setProfileLoading(false)
    }
  }, [])

  // ── Fetch today's existing log ────────────────────────────────────────

  const fetchTodayLog = useCallback(async () => {
    try {
      const res = await fetch('/api/daily-log', { credentials: 'include' })
      const json = (await res.json()) as ApiResponse<{
        workSummary: string
        notes: string | null
      } | null>
      if (res.ok && json.data) {
        setTodayLogText(json.data.workSummary)
        setTodayLogNotes(json.data.notes ?? '')
      }
    } catch {
      // Non-critical — leave fields empty
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user && user.role !== 'ADMIN') {
      void fetchProfile()
      void fetchTodayLog()
    }
  }, [authLoading, user, fetchProfile, fetchTodayLog])

  // ── Save today's log ──────────────────────────────────────────────────

  async function handleSaveLog() {
    if (!todayLogText.trim()) return
    setLogSaving(true)
    setLogError(null)
    setLogSuccess(false)
    try {
      const res = await fetch('/api/daily-log', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workSummary: todayLogText,
          notes: todayLogNotes || null,
        }),
      })
      const json = (await res.json()) as ApiResponse<unknown>
      if (!res.ok) {
        setLogError(json.error ?? 'Failed to save log')
        return
      }
      setLogSuccess(true)
      void fetchProfile()
    } catch {
      setLogError('Failed to save log')
    } finally {
      setLogSaving(false)
    }
  }

  // ── Change password ───────────────────────────────────────────────────

  async function handleChangePassword() {
    setPwError(null)
    setPwSuccess(false)

    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match')
      return
    }

    setPwSaving(true)
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const json = (await res.json()) as ApiResponse<{ success: boolean }>
      if (!res.ok) {
        setPwError(json.error ?? 'Failed to update password')
        return
      }
      setPwSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setPwError('Failed to update password')
    } finally {
      setPwSaving(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────

  if (authLoading || profileLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">
        <SkeletonCard rows={4} />
        <SkeletonCard rows={3} />
        <SkeletonCard rows={5} />
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-background-secondary border border-status-danger p-6 text-center">
          <p className="font-mono text-sm text-status-danger">{profileError}</p>
          <button
            type="button"
            onClick={() => void fetchProfile()}
            className="mt-4 font-mono text-xs border border-border-default px-4 py-2 text-text-muted hover:border-accent hover:text-accent transition-colors"
          >
            RETRY
          </button>
        </div>
      </div>
    )
  }

  if (!profileData) return null

  const { user: profileUser, projects, activityThisWeek, dailyLogsThisWeek } = profileData

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">

      {/* ── Header card ──────────────────────────────────────────────── */}
      <div className="bg-background-secondary border border-border-default p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <span className="font-mono text-xl font-bold text-accent">
              {getInitials(profileUser.name)}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="font-mono text-lg font-bold text-text-primary truncate">
              {profileUser.name}
            </h1>
            <p className="font-mono text-xs text-text-secondary mt-0.5 truncate">
              {profileUser.email}
            </p>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Role badge */}
              <span className="font-mono text-[10px] tracking-widest border border-border-default px-2 py-0.5 text-text-muted">
                {profileUser.role}
              </span>

              {/* Status */}
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest">
                <span
                  className={[
                    'inline-block w-1.5 h-1.5 rounded-full',
                    profileUser.currentStatus === 'WORKING'
                      ? 'bg-status-success'
                      : 'bg-text-muted',
                  ].join(' ')}
                />
                {profileUser.currentStatus === 'WORKING' ? (
                  <span className="text-status-success">WORKING</span>
                ) : (
                  <span className="text-text-muted">NOT WORKING</span>
                )}
              </span>
            </div>

            <p className="font-mono text-[10px] text-text-muted mt-2">
              Member since {formatMemberSince(profileUser.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Activity This Week ────────────────────────────────────────── */}
      <div className="bg-background-secondary border border-border-default p-6">
        <h2 className="font-mono text-xs tracking-widest text-text-muted mb-4">
          ACTIVITY THIS WEEK
        </h2>
        <div className="flex items-end gap-3">
          {activityThisWeek.map((entry, i) => (
            <div key={entry.date} className="flex flex-col items-center gap-1.5">
              <span
                className={[
                  'w-4 h-4 rounded-full border',
                  entry.wasActive
                    ? 'bg-status-success border-status-success'
                    : 'bg-transparent border-border-default',
                ].join(' ')}
                aria-label={`${DAY_LABELS[i] ?? ''}: ${entry.wasActive ? 'active' : 'inactive'}`}
              />
              <span className="font-mono text-[9px] text-text-muted">
                {DAY_LABELS[i] ?? ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── My Projects ──────────────────────────────────────────────── */}
      <div className="bg-background-secondary border border-border-default p-6">
        <h2 className="font-mono text-xs tracking-widest text-text-muted mb-4">
          MY PROJECTS
        </h2>
        {projects.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">
            You haven&apos;t been assigned to any projects yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="font-mono text-xs text-text-primary hover:text-accent transition-colors truncate"
                >
                  {p.name}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {p.isLead && (
                    <span className="font-mono text-[9px] tracking-widest text-accent border border-accent/40 px-1.5 py-0.5">
                      LEAD
                    </span>
                  )}
                  <span
                    className={[
                      'font-mono text-[9px] tracking-widest border px-1.5 py-0.5',
                      projectStatusClass(p.status),
                    ].join(' ')}
                  >
                    {p.status.replace('_', ' ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Daily Logs This Week ──────────────────────────────────────── */}
      <div className="bg-background-secondary border border-border-default p-6">
        <h2 className="font-mono text-xs tracking-widest text-text-muted mb-4">
          DAILY LOGS THIS WEEK
        </h2>

        {dailyLogsThisWeek.length === 0 ? (
          <p className="font-mono text-xs text-text-muted mb-6">No logs this week.</p>
        ) : (
          <ul className="space-y-4 mb-6">
            {dailyLogsThisWeek.map((log) => (
              <li key={log.date} className="border-l-2 border-border-default pl-3">
                <p className="font-mono text-[10px] text-text-muted mb-1">
                  {formatDate(log.date)}
                </p>
                <p className="font-mono text-xs text-text-primary">{log.workSummary}</p>
                {log.notes && (
                  <p className="font-mono text-[10px] text-text-secondary mt-1">{log.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Write today's log */}
        <div className="border-t border-border-default pt-4">
          <p className="font-mono text-[10px] tracking-widest text-text-muted mb-3">
            WRITE TODAY&apos;S LOG
          </p>
          <textarea
            value={todayLogText}
            onChange={(e) => setTodayLogText(e.target.value)}
            placeholder="What did you work on today?"
            rows={3}
            className="w-full bg-background-primary border border-border-default font-mono text-xs text-text-primary placeholder:text-text-muted p-3 resize-none focus:outline-none focus:border-accent transition-colors"
          />
          <textarea
            value={todayLogNotes}
            onChange={(e) => setTodayLogNotes(e.target.value)}
            placeholder="Any notes? (optional)"
            rows={2}
            className="w-full mt-2 bg-background-primary border border-border-default font-mono text-xs text-text-primary placeholder:text-text-muted p-3 resize-none focus:outline-none focus:border-accent transition-colors"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => void handleSaveLog()}
              disabled={logSaving || !todayLogText.trim()}
              className="font-mono text-xs border border-border-default px-4 py-2 text-text-muted tracking-widest hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {logSaving ? 'SAVING…' : 'SAVE LOG'}
            </button>
            {logSuccess && (
              <span className="font-mono text-[10px] text-status-success tracking-widest">
                ✓ SAVED
              </span>
            )}
            {logError && (
              <span className="font-mono text-[10px] text-status-danger">{logError}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Change Password ───────────────────────────────────────────── */}
      <div className="bg-background-secondary border border-border-default p-6">
        <button
          type="button"
          onClick={() => {
            setShowPasswordForm((prev) => !prev)
            setPwError(null)
            setPwSuccess(false)
          }}
          className="font-mono text-xs tracking-widest text-text-muted hover:text-accent transition-colors"
        >
          {showPasswordForm ? '▾ CHANGE PASSWORD' : '▸ CHANGE PASSWORD'}
        </button>

        {showPasswordForm && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="font-mono text-[10px] text-text-muted tracking-widest block mb-1">
                CURRENT PASSWORD
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-background-primary border border-border-default font-mono text-xs text-text-primary p-3 focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] text-text-muted tracking-widest block mb-1">
                NEW PASSWORD
                <span className="text-text-muted ml-2 normal-case">(min 8 characters)</span>
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-background-primary border border-border-default font-mono text-xs text-text-primary p-3 focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] text-text-muted tracking-widest block mb-1">
                CONFIRM NEW PASSWORD
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-background-primary border border-border-default font-mono text-xs text-text-primary p-3 focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void handleChangePassword()}
                disabled={pwSaving}
                className="font-mono text-xs border border-border-default px-4 py-2 text-text-muted tracking-widest hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pwSaving ? 'UPDATING…' : 'UPDATE PASSWORD'}
              </button>
              {pwSuccess && (
                <span className="font-mono text-[10px] text-status-success tracking-widest">
                  ✓ UPDATED
                </span>
              )}
              {pwError && (
                <span className="font-mono text-[10px] text-status-danger">{pwError}</span>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
