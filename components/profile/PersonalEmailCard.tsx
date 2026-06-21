'use client'

import { useState } from 'react'

// Lets a member set/clear their personal email. Used by the Workspace "Work"
// mail filter so mail from a teammate's personal address still counts as work mail.
export default function PersonalEmailCard({ initial, onSaved }: { initial: string | null; onSaved: () => void }) {
  const [value, setValue] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const dirty = value.trim().toLowerCase() !== (initial ?? '').toLowerCase()

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/users/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ personalEmail: value.trim() || null }),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        setMsg(j.error || 'Failed to save')
        return
      }
      setMsg('Saved')
      onSaved()
    } catch {
      setMsg('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => { setValue(e.target.value); setMsg('') }}
          placeholder="you@personal.com"
          className="flex-1 h-9 px-3 bg-background-primary border border-border-default font-mono text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="h-9 px-4 bg-[#3F7A0A] text-white font-mono text-xs hover:bg-[#356a08] disabled:opacity-40"
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>
      {msg && <p className="font-mono text-[10px] text-text-muted">{msg}</p>}
    </div>
  )
}
