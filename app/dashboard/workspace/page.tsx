'use client'

import { useState } from 'react'

import MailPanel from '@/components/workspace/MailPanel'
import CodePanel from '@/components/workspace/CodePanel'
import MeetPanel from '@/components/workspace/MeetPanel'

const TABS = [
  { key: 'mail', label: '📬 Mail' },
  { key: 'code', label: '⌥ Code' },
  { key: 'meet', label: '📹 Meet' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function WorkspacePage() {
  const [tab, setTab] = useState<TabKey>('mail')

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <h1 className="font-mono text-xs uppercase tracking-widest text-text-secondary mb-3">Workspace</h1>
      <div className="flex gap-1 mb-4 border-b border-border-default">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-mono -mb-px border-b-2 transition-colors ${
              tab === t.key ? 'border-[#3F7A0A] text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mail' && <MailPanel />}
      {tab === 'code' && <CodePanel />}
      {tab === 'meet' && <MeetPanel />}
    </div>
  )
}
