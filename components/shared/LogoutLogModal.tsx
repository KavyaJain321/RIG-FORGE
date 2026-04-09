'use client'

import { useEffect, useState, useCallback } from 'react'
import type { DailyLogEntry } from '@/lib/types'

interface LogoutLogModalProps {
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
}

interface FormState {
  workSummary: string
  notes: string
}

interface FetchState {
  loading: boolean
  saving: boolean
  error: string | null
}

const INITIAL_FORM: FormState = { workSummary: '', notes: '' }
const INITIAL_FETCH: FetchState = { loading: false, saving: false, error: null }

function isWeekend(): boolean {
  const day = new Date().getDay()
  return day === 0 || day === 6
}

export default function LogoutLogModal({
  isOpen,
  onClose,
  onLogout,
}: LogoutLogModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [fetchState, setFetchState] = useState<FetchState>(INITIAL_FETCH)

  const prefillFromApi = useCallback(async () => {
    setFetchState({ loading: true, saving: false, error: null })
    try {
      const res = await fetch('/api/daily-log', { credentials: 'include' })
      if (!res.ok) {
        setFetchState({ loading: false, saving: false, error: null })
        return
      }
      const json = (await res.json()) as { data: DailyLogEntry | null; error: string | null }
      if (json.data) {
        setForm({
          workSummary: json.data.workSummary,
          notes: json.data.notes ?? '',
        })
      }
      setFetchState({ loading: false, saving: false, error: null })
    } catch {
      // Non-fatal: prefill failure should not block the modal
      setFetchState({ loading: false, saving: false, error: null })
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    if (isWeekend()) {
      onLogout()
      return
    }

    setForm(INITIAL_FORM)
    setFetchState(INITIAL_FETCH)
    prefillFromApi()
  }, [isOpen, onLogout, prefillFromApi])

  const handleSaveAndLogout = useCallback(async () => {
    if (form.workSummary.trim().length === 0) {
      setFetchState((prev) => ({
        ...prev,
        error: 'Please describe what you worked on today.',
      }))
      return
    }

    setFetchState({ loading: false, saving: true, error: null })

    try {
      const res = await fetch('/api/daily-log', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workSummary: form.workSummary.trim(),
          notes: form.notes.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const json = (await res.json()) as { error: string | null }
        setFetchState({
          loading: false,
          saving: false,
          error: json.error ?? 'Failed to save log. You can still sign out.',
        })
        return
      }

      onLogout()
    } catch {
      setFetchState({
        loading: false,
        saving: false,
        error: 'Network error saving log. You can still sign out below.',
      })
    }
  }, [form, onLogout])

  const handleWorkSummaryChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, workSummary: e.target.value }))
    },
    []
  )

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, notes: e.target.value }))
    },
    []
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
    >
      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-700">
          <h2
            id="logout-modal-title"
            className="text-xl font-semibold text-white"
          >
            Before you go...
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Take a minute to log what you worked on today.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {fetchState.loading && (
            <p className="text-sm text-zinc-500 animate-pulse">
              Loading today&apos;s log...
            </p>
          )}

          {fetchState.error && (
            <div
              className="rounded-lg bg-red-900/40 border border-red-700/60 px-4 py-3 text-sm text-red-300"
              role="alert"
            >
              {fetchState.error}
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor="workSummary"
              className="block text-sm font-medium text-zinc-300"
            >
              What did you work on? <span className="text-red-400">*</span>
            </label>
            <textarea
              id="workSummary"
              rows={4}
              maxLength={2000}
              value={form.workSummary}
              onChange={handleWorkSummaryChange}
              placeholder="What did you work on today?"
              disabled={fetchState.saving}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 transition"
            />
            <p className="text-right text-xs text-zinc-500">
              {form.workSummary.length}/2000
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="logNotes"
              className="block text-sm font-medium text-zinc-300"
            >
              Notes <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="logNotes"
              rows={3}
              value={form.notes}
              onChange={handleNotesChange}
              placeholder="Any notes or blockers? (optional)"
              disabled={fetchState.saving}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onLogout}
            disabled={fetchState.saving}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white border border-zinc-600 hover:border-zinc-400 transition disabled:opacity-40"
          >
            Skip &amp; Sign Out
          </button>

          <button
            type="button"
            onClick={handleSaveAndLogout}
            disabled={fetchState.saving || fetchState.loading}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchState.saving ? 'Saving...' : 'Save Log & Sign Out'}
          </button>
        </div>
      </div>
    </div>
  )
}
