'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface Status {
  configured: boolean
  connected: boolean
  email: string | null
  connectedAt: string | null
}

/**
 * Drop-in card for the Profile page. Shows current Google connection
 * status and a Connect / Disconnect button. Reads ?google=connected
 * etc. from the URL after the OAuth callback redirects back here.
 */
export default function GoogleConnectCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const params = useSearchParams()

  // Surface ?google= query params after the OAuth callback
  useEffect(() => {
    const v = params.get('google')
    if (!v) return
    if (v === 'connected') setToast('✓ Google Calendar connected.')
    else if (v === 'cancelled') setToast('Connection cancelled.')
    else if (v === 'error') {
      const reason = params.get('reason')
      setToast(`Connection failed${reason ? `: ${reason}` : '.'}`)
    }
    // Clear the toast after 6 seconds
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [params])

  // Load current status
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/google/status', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as { data?: Status }
        if (json.data) setStatus(json.data)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Re-fetch status if the URL param changed (after a successful connect)
  useEffect(() => {
    if (params.get('google') !== 'connected') return
    void (async () => {
      const res = await fetch('/api/auth/google/status', { credentials: 'include' })
      if (!res.ok) return
      const json = (await res.json()) as { data?: Status }
      if (json.data) setStatus(json.data)
    })()
  }, [params])

  if (loading) return null
  if (!status) return null

  // Server doesn't have Google OAuth configured — admin needs to set
  // GOOGLE_CLIENT_ID etc. in env. Show a quiet hint, not a button.
  if (!status.configured) {
    return (
      <div className="bg-white border border-black/10 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-mono uppercase tracking-widest text-[#1A1A1A]">
              Google Calendar
            </h3>
            <p className="text-xs text-[#999] mt-1">
              Not yet enabled on this server. An admin needs to configure the
              integration before users can connect.
            </p>
          </div>
        </div>
      </div>
    )
  }

  function connect() {
    setBusy(true)
    window.location.href = '/api/auth/google/connect'
  }

  async function disconnect() {
    if (!confirm('Disconnect Google Calendar from Forgie? You can reconnect anytime.')) return
    setBusy(true)
    try {
      const res = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setStatus({ ...status!, connected: false, email: null, connectedAt: null })
        setToast('Disconnected.')
      } else {
        setToast('Disconnect failed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-black/10 rounded-2xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-mono uppercase tracking-widest text-[#1A1A1A]">
            Google Calendar
          </h3>
          {status.connected ? (
            <>
              <p className="text-sm text-[#1A1A1A] mt-2">
                ✓ Connected as <span className="font-medium">{status.email}</span>
              </p>
              <p className="text-xs text-[#999] mt-1">
                Forgie can now schedule meetings, find free time across attendees,
                and auto-generate Meet links on your behalf.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[#666] mt-2">
                Let Forgie schedule meetings and create Meet links for you.
              </p>
              <p className="text-xs text-[#999] mt-1">
                Forgie will only read/write events in your primary calendar. You can
                disconnect any time.
              </p>
            </>
          )}
          {toast && (
            <p className="text-xs text-[#1A1A1A] mt-3 px-3 py-2 bg-[#F2F2EE] rounded-lg">
              {toast}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={status.connected ? disconnect : connect}
          disabled={busy}
          className={[
            'shrink-0 h-9 px-4 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
            status.connected
              ? 'bg-white border border-black/10 text-[#666] hover:text-[#1A1A1A]'
              : 'bg-[#1A1A1A] text-white hover:bg-[#333]',
          ].join(' ')}
        >
          {busy ? '...' : status.connected ? 'Disconnect' : 'Connect Google'}
        </button>
      </div>
    </div>
  )
}
