'use client'

/**
 * "Finish setting up" prompt shown on the dashboard after login.
 *
 * Soft nudge (never blocking, unlike the password gate): appears only while the
 * user still has something to do — connect Google — and is dismissible for the
 * session. Disappears on its own once done.
 */

import { useEffect, useState } from 'react'
import type { ApiResponse } from '@/lib/types'

interface SetupStatus {
  google: { configured: boolean; connected: boolean }
  needsGoogle: boolean
  complete: boolean
}

const DISMISS_KEY = 'rf-setup-prompt-dismissed'

export default function SetupPrompt() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/users/me/setup-status', { credentials: 'include' })
      const json = (await res.json()) as ApiResponse<SetupStatus>
      if (res.ok && json.data) setStatus(json.data)
    } catch {
      /* silent — this is a non-critical nudge */
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true)
    }
    void load()
  }, [])

  if (dismissed || !status || !status.needsGoogle) return null

  function dismiss() {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className="bg-surface-raised border border-border-default rounded-2xl p-5 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-text-primary">Finish setting up</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Optional, but it makes Forgie far more useful for you. You can do this anytime from your profile.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="font-mono text-[10px] tracking-widest text-text-muted hover:text-text-primary transition-colors"
        >
          DISMISS
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {status.needsGoogle && (
          <div className="flex items-center justify-between gap-3 border border-border-subtle rounded-lg px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Connect Google</p>
              <p className="text-xs text-text-secondary">
                Lets Forgie manage your Calendar, Gmail and Drive on your behalf.
              </p>
            </div>
            <a
              href="/api/auth/google/connect"
              className="shrink-0 font-mono text-xs border border-border-default px-4 py-2 text-text-muted tracking-widest hover:border-accent hover:text-accent-ink transition-colors"
            >
              CONNECT
            </a>
          </div>
        )}

      </div>
    </div>
  )
}
