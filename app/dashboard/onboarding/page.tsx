'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import GenerateUserModal from '@/components/onboarding/GenerateUserModal'
import PendingUserCard from '@/components/onboarding/PendingUserCard'

interface PendingUser {
  id: string; name: string; email: string; role: string
  createdAt: string; hasLoggedIn: boolean; lastSeenAt: string | null
}
interface ApprovedUser {
  id: string; name: string; email: string; role: string; createdAt: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const { loading } = useAuth()
  const { user } = useAuthStore()

  const [showGenerate, setShowGenerate] = useState(false)
  const [pending, setPending] = useState<PendingUser[]>([])
  const [approved, setApproved] = useState<ApprovedUser[]>([])
  const [fetching, setFetching] = useState(true)

  const fetchData = useCallback(async () => {
    setFetching(true)
    try {
      const [pendRes, approvedRes] = await Promise.all([
        fetch('/api/admin/onboarding/pending', { credentials: 'include' }),
        fetch('/api/users?approved=true&limit=10', { credentials: 'include' }),
      ])
      const pendJson = await pendRes.json() as { data: PendingUser[] | null }
      const approvedJson = await approvedRes.json() as { data: { items: ApprovedUser[] } | ApprovedUser[] | null }

      setPending(pendJson.data ?? [])
      if (approvedJson.data) {
        const list = Array.isArray(approvedJson.data) ? approvedJson.data : (approvedJson.data as { items: ApprovedUser[] }).items ?? []
        setApproved(list)
      }
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/login'); return }
      if (user.role !== 'ADMIN') { router.push('/dashboard'); return }
      void fetchData()
    }
  }, [loading, user, router, fetchData])

  if (loading || !user) return null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="type-meta text-accent mb-1">ADMIN</p>
            <h1 className="type-h3">Onboarding</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowGenerate(true)}
            className="h-9 px-4 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity"
          >
            + Generate User
          </button>
        </div>

        {/* Pending Approval */}
        <section className="mb-8">
          <h2 className="font-mono text-xs text-text-muted uppercase tracking-widest mb-3">
            Pending Approval ({pending.length})
          </h2>
          {fetching ? (
            <p className="font-mono text-xs text-text-muted">Loading...</p>
          ) : pending.length === 0 ? (
            <div className="bg-surface-raised border border-border-default rounded-card p-6 text-center">
              <p className="font-mono text-xs text-text-muted">No users pending approval.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((u) => (
                <PendingUserCard key={u.id} user={u} onAction={() => void fetchData()} />
              ))}
            </div>
          )}
        </section>

        {/* Recently Approved */}
        <section>
          <h2 className="font-mono text-xs text-text-muted uppercase tracking-widest mb-3">
            Recently Approved
          </h2>
          {approved.length === 0 ? (
            <div className="bg-surface-raised border border-border-default rounded-card p-6 text-center">
              <p className="font-mono text-xs text-text-muted">No approved users yet.</p>
            </div>
          ) : (
            <div className="bg-surface-raised border border-border-default rounded-card divide-y divide-border-default">
              {approved.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-mono text-xs text-text-primary">{u.name}</p>
                    <p className="font-mono text-[10px] text-text-muted">{u.email}</p>
                  </div>
                  <span className="font-mono text-[10px] text-text-muted uppercase">{u.role}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showGenerate && (
        <GenerateUserModal
          onClose={() => setShowGenerate(false)}
          onGenerated={() => void fetchData()}
        />
      )}
    </div>
  )
}
