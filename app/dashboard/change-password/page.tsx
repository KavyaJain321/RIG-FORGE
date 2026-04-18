'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser, ApiResponse } from '@/lib/types'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { setUser } = useAuthStore()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const json = await res.json() as ApiResponse<AuthUser>
      if (!res.ok || !json.data) {
        setError((json as { error: string }).error ?? 'Failed to change password')
        return
      }
      // Update auth store with new user data (mustChangePassword = false)
      setUser(json.data)
      setSuccess(true)
      setTimeout(() => router.replace('/dashboard'), 1200)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="font-mono text-[10px] text-accent tracking-widest uppercase mb-2">
            ⚠ ACTION REQUIRED
          </p>
          <h1 className="font-mono font-bold text-2xl text-primary tracking-tight">
            Change Your Password
          </h1>
          <p className="font-mono text-xs text-muted mt-3 leading-relaxed">
            You are using a temporary password that was shared with you.<br />
            Please set a new private password before continuing.
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-raised border border-border-default p-8">
          {success ? (
            <div className="text-center py-4">
              <p className="text-status-success font-mono text-sm mb-1">✓ Password changed successfully!</p>
              <p className="font-mono text-xs text-muted">Redirecting to dashboard...</p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
              {/* Current (temp) password */}
              <div>
                <label className="font-mono text-[10px] text-muted tracking-widest uppercase block mb-2">
                  Temporary Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your temporary password"
                    required
                    className="w-full bg-background-primary border border-border-default px-4 py-3 pr-16 font-mono text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted hover:text-accent tracking-widest transition-colors"
                  >
                    {showCurrent ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="font-mono text-[10px] text-muted tracking-widest uppercase block mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    className="w-full bg-background-primary border border-border-default px-4 py-3 pr-16 font-mono text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted hover:text-accent tracking-widest transition-colors"
                  >
                    {showNew ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="font-mono text-[10px] text-muted tracking-widest uppercase block mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  className="w-full bg-background-primary border border-border-default px-4 py-3 font-mono text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none transition-colors"
                />
              </div>

              {error && (
                <p className="font-mono text-xs text-status-danger">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-background-primary font-mono text-xs tracking-widest py-3 transition-colors duration-150"
              >
                {loading ? 'SAVING...' : 'SET NEW PASSWORD'}
              </button>
            </form>
          )}
        </div>

        <p className="font-mono text-[10px] text-muted text-center mt-4 tracking-wide">
          RIG FORGE — INTERNAL USE ONLY
        </p>
      </div>
    </div>
  )
}
