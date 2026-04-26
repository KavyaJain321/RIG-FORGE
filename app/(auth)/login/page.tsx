'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import { SmokeBackground } from '@/components/ui/spooky-smoke-animation'
import { useAuthStore } from '@/store/authStore'
import { fetchWithRetry } from '@/lib/fetch-with-retry'
import type { AuthUser, ApiResponse } from '@/lib/types'

export default function LoginPage() {
  const router = useRouter()
  const { setUser, clearUser } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Always clear any existing session when visiting login page
  // User must re-authenticate every time
  useEffect(() => {
    clearUser()
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
  }, [clearUser])

  async function handleSubmit(): Promise<void> {
    if (isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      // fetchWithRetry silently retries once on 500/502/503/504 — hides
      // transient server blips (e.g., post-cold-start stale-pool errors)
      // from the user. Wrong-password 401s are NOT retried.
      const res = await fetchWithRetry('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
        retries: 1,
        retryDelayMs: 2000,
      })

      const json: ApiResponse<AuthUser> = await res.json() as ApiResponse<AuthUser>

      if (res.ok && json.data) {
        setUser(json.data)
        router.push('/dashboard')
      } else {
        setError(json.error ?? 'Authentication failed')
        setIsLoading(false)
      }
    } catch {
      setError('Unable to connect. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="absolute inset-0 z-0">
        <SmokeBackground smokeColor="#1a3a5c" />
      </div>
      <Card className="relative z-10 w-full max-w-[460px] p-8 md:p-10">
        <div className="text-center">
          <p className="type-meta text-accent">WORKFORCE INTELLIGENCE PLATFORM</p>
          <h1 className="type-h1 mt-2">Rig Forge</h1>
          <p className="type-body-muted mt-2">Secure operational command access</p>
        </div>

        <form
          className="mt-9 space-y-5"
          onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
        >
          <Input
            id="email"
            type="email"
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            placeholder="operator@domain.gov"
            autoComplete="email"
          />

          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              label="Access Key"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pr-20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              className="absolute right-3 top-[40px] font-mono text-[10px] tracking-widest text-text-muted hover:text-accent"
            >
              {showPassword ? 'HIDE' : 'SHOW'}
            </button>
          </div>

          {error && <Alert variant="error">ERROR  {error}</Alert>}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2"
            size="lg"
            variant="gov-emphasis"
          >
            {isLoading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
          </Button>
        </form>

        <div className="mt-10 text-center">
          <p className="type-meta">RIG FORGE v1.0 — INTERNAL USE ONLY</p>
          <p className="type-meta mt-1">UNAUTHORIZED ACCESS IS PROHIBITED</p>
        </div>
      </Card>
    </div>
  )
}
