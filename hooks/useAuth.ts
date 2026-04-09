'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser, ApiResponse } from '@/lib/types'

interface UseAuthReturn {
  user: AuthUser | null
  loading: boolean
}

export function useAuth(): UseAuthReturn {
  const { user, setUser } = useAuthStore()
  // If we already have a user in the store (e.g. just logged in), start resolved
  const [loading, setLoading] = useState(!user)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function verifySession(): Promise<void> {
      try {
        const res = await fetch('/api/auth/me', { method: 'GET', credentials: 'include' })
        const json = await res.json() as ApiResponse<AuthUser>
        if (res.ok && json.data) {
          setUser(json.data)
        } else {
          setUser(null)
        }
      } catch {
        // Network error — keep existing user state rather than logging out
      } finally {
        setLoading(false)
      }
    }
    void verifySession()
  }, [setUser])

  // Heartbeat every 5 minutes for active (non-onboarding) users
  useEffect(() => {
    if (!user || user.isOnboarding) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      return
    }

    heartbeatRef.current = setInterval(() => {
      void fetch('/api/heartbeat', { method: 'POST', credentials: 'include' })
    }, 5 * 60 * 1000)

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [user])

  return { user, loading }
}
