'use client'

import { useCallback, useEffect, useState } from 'react'

import { useAuthStore } from '@/store/authStore'
import JitsiCall from './JitsiCall'

interface Evt {
  id: string
  title: string
  start: string | null
  end: string | null
  meetLink: string | null
  eventUrl: string | null
  isAllDay: boolean
}

async function api<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Request failed')
  return j.data as T
}

function when(iso: string | null, allDay: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' })
  return allDay ? day : `${day}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export default function MeetPanel() {
  const user = useAuthStore((s) => s.user)
  const displayName = user?.name ?? 'Guest'

  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [copied, setCopied] = useState(false)
  const [calConnected, setCalConnected] = useState<boolean | null>(null)
  const [events, setEvents] = useState<Evt[]>([])
  const [loading, setLoading] = useState(false)

  // Join straight into a call when arriving via an invite link (?call=<room>).
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('call')
    if (room) setActiveRoom(room)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const s = await api<{ features: { calendar: boolean } }>('/api/auth/google/status')
        setCalConnected(s.features?.calendar ?? false)
      } catch {
        setCalConnected(false)
      }
    })()
  }, [])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api<{ events: Evt[] }>('/api/google/calendar/events')
      setEvents(r.events)
    } catch (e) {
      console.error('[meet] events', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (calConnected) void loadEvents()
  }, [calConnected, loadEvents])

  function startCall() {
    const slug = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24)
    const rand = Math.random().toString(36).slice(2, 8)
    setActiveRoom(`rigforge-${slug ? slug + '-' : ''}${rand}`)
  }

  function leave() {
    setActiveRoom(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('call')
    window.history.replaceState({}, '', url.toString())
  }

  function copyInvite() {
    if (!activeRoom) return
    const link = `${window.location.origin}/dashboard/workspace?call=${activeRoom}`
    void navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ── Active call: Jitsi embedded right here ──────────────────────────────────
  if (activeRoom) {
    return (
      <div className="border border-border-default rounded-xl overflow-hidden flex flex-col h-[calc(100vh-9rem)]">
        <div className="h-12 px-4 flex items-center justify-between gap-2 border-b border-border-default shrink-0">
          <span className="font-mono text-xs uppercase tracking-widest text-text-secondary truncate">📹 {activeRoom}</span>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={copyInvite} className="h-8 px-3 rounded-full border border-border-default text-xs font-mono text-text-primary">
              {copied ? 'Copied!' : 'Copy invite'}
            </button>
            <button type="button" onClick={leave} className="h-8 px-3 rounded-full bg-status-danger text-white text-xs font-mono">Leave</button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-black">
          <JitsiCall room={activeRoom} displayName={displayName} onLeave={leave} />
        </div>
      </div>
    )
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  return (
    <div className="border border-border-default rounded-xl overflow-hidden">
      <div className="p-5 border-b border-border-default">
        <p className="text-sm font-medium text-text-primary mb-2">Start a video call</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (optional)"
            className="h-10 px-3 rounded-lg border border-border-default bg-surface-raised text-sm outline-none focus:border-[#3F7A0A] w-56"
          />
          <button type="button" onClick={startCall} className="h-10 px-5 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08]">
            📹 Start call
          </button>
          <span className="text-xs text-text-secondary">Runs right here in RF — share the invite link to bring teammates in.</span>
        </div>
      </div>

      <div className="p-3">
        <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Upcoming (7 days)</p>
        {calConnected === false ? (
          <p className="px-2 py-2 text-xs text-text-secondary">Connect Google in your profile to see your calendar here.</p>
        ) : loading || calConnected === null ? (
          <p className="p-3 text-sm text-text-secondary">Loading…</p>
        ) : events.length === 0 ? (
          <p className="p-3 text-sm text-text-secondary">Nothing scheduled.</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-2 py-2.5 border-b border-black/[0.05] last:border-0">
              <div className="min-w-0">
                <p className="text-sm text-text-primary truncate">{e.title}</p>
                <p className="text-[11px] text-text-secondary">{when(e.start, e.isAllDay)}</p>
              </div>
              {e.meetLink ? (
                <a href={e.meetLink} target="_blank" rel="noopener noreferrer" className="shrink-0 h-8 leading-8 px-3 rounded-full bg-[#3F7A0A] text-white text-xs font-mono">Join</a>
              ) : e.eventUrl ? (
                <a href={e.eventUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-mono text-text-secondary">Open ↗</a>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
