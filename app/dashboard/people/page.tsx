'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/hooks/useAuth'
import MemberCard from '@/components/people/MemberCard'
import type { MemberSummary, ApiResponse, PaginatedResponse } from '@/lib/types'

const PAGE_LIMIT = 20

export default function PeoplePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [members, setMembers] = useState<MemberSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, user, router])

  // Debounce search input 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchMembers = useCallback(async (cursorParam?: string): Promise<void> => {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) })
    if (cursorParam) params.set('cursor', cursorParam)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (role) params.set('role', role)
    if (status) params.set('status', status)

    const res = await fetch(`/api/users?${params.toString()}`, { credentials: 'include' })
    const json = await res.json() as ApiResponse<PaginatedResponse<MemberSummary>>

    if (res.ok && json.data) {
      const { items, nextCursor: cursor, total: count } = json.data
      if (cursorParam) {
        setMembers((prev) => [...prev, ...items])
      } else {
        setMembers(items)
      }
      setNextCursor(cursor)
      setTotal(count)
    }
  }, [debouncedSearch, role, status])

  // Reset + refetch when filters change
  useEffect(() => {
    if (authLoading || !user) return
    setLoading(true)
    setNextCursor(null)
    fetchMembers()
      .catch(() => { /* keep empty state on error */ })
      .finally(() => setLoading(false))
  }, [fetchMembers, authLoading, user])

  const handleLoadMore = async (): Promise<void> => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      await fetchMembers(nextCursor)
    } catch {
      // keep existing list on error
    } finally {
      setLoadingMore(false)
    }
  }

  if (authLoading) return null

  const remaining = total - members.length

  return (
    <div className="min-h-full">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-muted tracking-widest">[ 01 — PEOPLE ]</p>
            <h1 className="font-mono font-bold text-3xl text-primary tracking-tight mt-1">
              TEAM MEMBERS
            </h1>
          </div>
          <div className="forge-card px-4 py-2 text-right">
            <p className="font-mono font-bold text-2xl text-accent forge-text-glow leading-none">
              {total}
            </p>
            <p className="font-mono text-xs text-muted mt-1">ACTIVE MEMBERS</p>
          </div>
        </div>
        <div className="border-t border-border-default mt-6" />
      </div>

      {/* ── Filters bar ──────────────────────────────────────── */}
      <div className="px-8 py-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-border-default rounded px-3 py-1.5 text-sm bg-surface-raised text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent w-56"
        />
        {user?.role === 'ADMIN' && (
          <>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-border-default rounded px-3 py-1.5 text-sm bg-surface-raised text-text-primary focus:outline-none">
              <option value="">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border-default rounded px-3 py-1.5 text-sm bg-surface-raised text-text-primary focus:outline-none">
              <option value="">All Status</option>
              <option value="WORKING">Working</option>
              <option value="NOT_WORKING">Not Working</option>
            </select>
          </>
        )}
      </div>

      {/* ── Member grid ──────────────────────────────────────── */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="forge-card h-48 bg-background-tertiary forge-shimmer"
              />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-muted text-6xl select-none">○</span>
            <p className="font-mono text-sm text-muted tracking-widest">NO MEMBERS FOUND</p>
            {(debouncedSearch || role || status) && (
              <p className="font-mono text-xs text-muted">
                {[
                  debouncedSearch && `search: "${debouncedSearch}"`,
                  role && `role: ${role}`,
                  status && `status: ${status}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                isSelected={selectedId === member.id}
                onClick={() => setSelectedId(member.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Load more ────────────────────────────────────────── */}
      {nextCursor && !loading && (
        <div className="px-8 pb-8 flex justify-center">
          <button
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className="forge-card px-8 py-3 font-mono text-xs text-secondary hover:text-accent transition-all duration-150 cursor-pointer disabled:opacity-50"
            style={loadingMore ? undefined : undefined}
          >
            {loadingMore ? 'LOADING...' : `LOAD MORE — ${remaining}`}
          </button>
        </div>
      )}

    </div>
  )
}
