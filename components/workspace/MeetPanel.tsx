'use client'

import { useCallback, useEffect, useState } from 'react'

interface Evt {
  id: string
  title: string
  start: string | null
  end: string | null
  meetLink: string | null
  eventUrl: string | null
  isAllDay: boolean
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'include', ...init })
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
  const [connected, setConnected] = useState<boolean | null>(null)
  const [events, setEvents] = useState<Evt[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newMeet, setNewMeet] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const s = await api<{ features: { calendar: boolean } }>('/api/auth/google/status')
        setConnected(s.features?.calendar ?? false)
      } catch {
        setConnected(false)
      }
    })()
  }, [])

  const load = useCallback(async () => {
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
    if (connected) void load()
  }, [connected, load])

  async function newMeeting() {
    setCreating(true)
    setNewMeet(null)
    try {
      const r = await api<{ meetLink: string | null; eventUrl: string | null }>('/api/google/meet/new', { method: 'POST' })
      const link = r.meetLink || r.eventUrl
      if (link) {
        setNewMeet(link)
        window.open(link, '_blank', 'noopener')
      }
      void load()
    } catch (e) {
      alert('Failed to create meeting: ' + (e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (connected === null) return <div className="p-8 font-mono text-sm text-text-secondary">Loading…</div>
  if (!connected) {
    return (
      <div className="p-10 text-center border border-border-default rounded-xl">
        <p className="text-2xl mb-2">📹</p>
        <p className="text-lg font-medium text-text-primary mb-1">Connect Google Calendar</p>
        <p className="text-sm text-text-secondary mb-5">Start Meet calls and see your upcoming events inside RIG FORGE.</p>
        <a href="/api/auth/google/connect" className="inline-block h-9 leading-9 px-4 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08]">
          Connect Google
        </a>
      </div>
    )
  }

  return (
    <div className="border border-border-default rounded-xl overflow-hidden">
      {/* New meeting */}
      <div className="p-5 border-b border-border-default flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void newMeeting()} disabled={creating} className="h-10 px-5 rounded-full bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] disabled:opacity-40">
          {creating ? 'Creating…' : '📹 New meeting'}
        </button>
        <span className="text-xs text-text-secondary">Creates a Google Meet + opens it in a new tab.</span>
        {newMeet && (
          <a href={newMeet} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-[#3F7A0A] break-all">{newMeet}</a>
        )}
      </div>

      {/* Upcoming events */}
      <div className="p-3">
        <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Upcoming (7 days)</p>
        {loading ? (
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
