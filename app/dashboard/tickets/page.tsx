'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { isAdminRole } from '@/lib/auth'
import TicketCard from '@/components/tickets/TicketCard'
import RaiseTicketModal from '@/components/tickets/RaiseTicketModal'

type TabType = 'OPEN' | 'ACCEPTED' | 'COMPLETED'

interface Ticket {
  id: string; title: string; description: string; status: string
  projectName: string; raisedByName: string; raisedById: string
  helperName: string | null; createdAt: string
}

// ─── Admin ticket list (all tickets) ─────────────────────────────────────────

function AdminTickets() {
  const { user } = useAuthStore()
  const [tab, setTab]           = useState<TabType>('OPEN')
  const [tickets, setTickets]   = useState<Ticket[]>([])
  const [fetching, setFetching] = useState(true)
  const [showRaise, setShowRaise] = useState(false)
  const [search, setSearch]     = useState('')

  const fetchTickets = useCallback(async () => {
    setFetching(true)
    try {
      const res  = await fetch(`/api/tickets?status=${tab}`, { credentials: 'include' })
      const json = await res.json() as { data: Ticket[] | null }
      setTickets(json.data ?? [])
    } finally {
      setFetching(false)
    }
  }, [tab])

  useEffect(() => { void fetchTickets() }, [fetchTickets])

  const filtered = tickets.filter((t) =>
    search === '' || t.title.toLowerCase().includes(search.toLowerCase())
  )

  const tabs: { key: TabType; label: string }[] = [
    { key: 'OPEN',      label: 'Open'      },
    { key: 'ACCEPTED',  label: 'Accepted'  },
    { key: 'COMPLETED', label: 'Completed' },
  ]

  if (!user) return null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="type-meta text-accent mb-1">{user.role}</p>
            <h1 className="type-h3">Tickets</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowRaise(true)}
            className="h-9 px-4 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity"
          >
            + Raise Ticket
          </button>
        </div>

        <div className="flex gap-1 mb-4 bg-background-tertiary border border-border-default rounded-card p-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={[
                'flex-1 h-8 font-mono text-xs rounded transition-colors',
                tab === key
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets..."
            className="w-full h-9 bg-background-tertiary border border-border-default rounded-card px-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {fetching ? (
          <p className="font-mono text-xs text-text-muted">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-raised border border-border-default rounded-card p-8 text-center">
            <p className="font-mono text-xs text-text-muted">
              No {tab.toLowerCase()} tickets{search ? ' matching your search' : ''}.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((t) => (
              <TicketCard key={t.id} ticket={t} currentUserId={user.id} />
            ))}
          </div>
        )}
      </div>

      {showRaise && (
        <RaiseTicketModal
          userRole={user.role}
          onClose={() => setShowRaise(false)}
          onCreated={() => void fetchTickets()}
        />
      )}
    </div>
  )
}

// ─── Employee view — raise only + own tickets ─────────────────────────────────

function EmployeeTickets() {
  const { user } = useAuthStore()
  const [tab, setTab]           = useState<TabType>('OPEN')
  const [tickets, setTickets]   = useState<Ticket[]>([])
  const [fetching, setFetching] = useState(true)
  const [showRaise, setShowRaise] = useState(false)

  const fetchTickets = useCallback(async () => {
    setFetching(true)
    try {
      // API now filters by raisedById for employees automatically
      const res  = await fetch(`/api/tickets?status=${tab}`, { credentials: 'include' })
      const json = await res.json() as { data: Ticket[] | null }
      setTickets(json.data ?? [])
    } finally {
      setFetching(false)
    }
  }, [tab])

  useEffect(() => { void fetchTickets() }, [fetchTickets])

  const tabs: { key: TabType; label: string }[] = [
    { key: 'OPEN',      label: 'Open'      },
    { key: 'ACCEPTED',  label: 'In Progress' },
    { key: 'COMPLETED', label: 'Resolved'  },
  ]

  if (!user) return null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="type-h3">My Tickets</h1>
            <p className="font-mono text-xs text-text-muted mt-1">
              Track tickets you have raised
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRaise(true)}
            className="h-9 px-4 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity"
          >
            + Raise Ticket
          </button>
        </div>

        {/* Info banner */}
        <div className="mb-5 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-card px-4 py-3">
          <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
          <p className="font-mono text-xs text-blue-700 leading-relaxed">
            Need help with something? Raise a ticket and an admin will pick it up. You can track your tickets here.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-background-tertiary border border-border-default rounded-card p-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={[
                'flex-1 h-8 font-mono text-xs rounded transition-colors',
                tab === key
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        {fetching ? (
          <p className="font-mono text-xs text-text-muted">Loading...</p>
        ) : tickets.length === 0 ? (
          <div className="bg-surface-raised border border-border-default rounded-card p-10 text-center">
            <p className="font-mono text-xs text-text-muted mb-3">
              {tab === 'OPEN'      ? 'No open tickets.' :
               tab === 'ACCEPTED'  ? 'No tickets in progress.' :
                                     'No resolved tickets.'}
            </p>
            {tab === 'OPEN' && (
              <button
                type="button"
                onClick={() => setShowRaise(true)}
                className="h-8 px-4 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity"
              >
                Raise a Ticket
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} currentUserId={user.id} />
            ))}
          </div>
        )}
      </div>

      {showRaise && (
        <RaiseTicketModal
          userRole={user.role}
          onClose={() => setShowRaise(false)}
          onCreated={() => void fetchTickets()}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const router = useRouter()
  const { loading } = useAuth()
  const { user }    = useAuthStore()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  if (loading || !user) return null

  return isAdminRole(user.role) ? <AdminTickets /> : <EmployeeTickets />
}
