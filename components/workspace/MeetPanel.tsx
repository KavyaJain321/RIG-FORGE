'use client'

import { useEffect, useState } from 'react'

import { useAuthStore } from '@/store/authStore'
import JitsiCall from './JitsiCall'

export default function MeetPanel() {
  const user = useAuthStore((s) => s.user)
  const displayName = user?.name ?? 'Guest'
  const email = user?.email ?? null
  const avatarUrl = user?.avatarUrl ?? null

  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [copied, setCopied] = useState(false)

  // Join straight into a call when arriving via an RF invite link (?call=<room>).
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('call')
    if (room) setActiveRoom(room)
  }, [])

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
    // RF-only link — opens RIG FORGE and joins the same in-app call.
    const link = `${window.location.origin}/dashboard/workspace?call=${activeRoom}`
    void navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ── Active call: runs embedded right here in RF ─────────────────────────────
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
          <JitsiCall room={activeRoom} displayName={displayName} email={email} avatarUrl={avatarUrl} onLeave={leave} />
        </div>
      </div>
    )
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  return (
    <div className="border border-border-default rounded-xl overflow-hidden">
      <div className="p-6">
        <p className="text-sm font-medium text-text-primary mb-1">Start a video call</p>
        <p className="text-xs text-text-secondary mb-4">Runs entirely inside RIG FORGE — share the invite link to bring teammates into the same call.</p>
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
        </div>
      </div>
    </div>
  )
}
