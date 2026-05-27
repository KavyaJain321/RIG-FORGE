'use client'

import { useAssistantStore, type PendingAction } from '@/store/assistantStore'

/**
 * Confirmation card rendered inline beneath an assistant message
 * whenever Forgie proposed a write action. The user taps Confirm to
 * actually execute it; Cancel discards.
 */
export default function ActionCard({
  messageId,
  action,
  conversationId,
}: {
  messageId: string
  action: PendingAction
  conversationId: string | null
}) {
  const { updateActionStatus } = useAssistantStore()

  async function confirm() {
    updateActionStatus(messageId, action.actionId, { status: 'confirming' })
    try {
      const res = await fetch('/api/assistant/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          action: action.action,
          args: action.args,
        }),
      })
      const json = (await res.json()) as {
        data?: { success: boolean; result?: unknown }
        error?: string
      }
      if (!res.ok || !json.data?.success) {
        updateActionStatus(messageId, action.actionId, {
          status: 'failed',
          errorText: json.error ?? 'Action failed.',
        })
        return
      }
      updateActionStatus(messageId, action.actionId, {
        status: 'confirmed',
        resultText: buildResultText(action.action, json.data.result),
      })
    } catch {
      updateActionStatus(messageId, action.actionId, {
        status: 'failed',
        errorText: 'Network error. Try again.',
      })
    }
  }

  function cancel() {
    updateActionStatus(messageId, action.actionId, { status: 'cancelled' })
  }

  // ─── Render by status ──────────────────────────────────────────────────

  if (action.status === 'confirmed') {
    return (
      <Wrapper tone="success">
        <Row>
          <CheckIcon />
          <span className="text-sm">{action.resultText ?? 'Done.'}</span>
        </Row>
      </Wrapper>
    )
  }

  if (action.status === 'cancelled') {
    return (
      <Wrapper tone="muted">
        <Row>
          <span className="font-mono text-[10px] tracking-widest text-[#999]">CANCELLED</span>
          <span className="text-sm text-[#888]">{action.label}</span>
        </Row>
      </Wrapper>
    )
  }

  if (action.status === 'failed') {
    return (
      <Wrapper tone="error">
        <div className="flex flex-col gap-1">
          <Row>
            <span className="text-sm font-medium text-red-700">Action failed</span>
          </Row>
          {action.errorText && (
            <p className="text-xs text-red-600">{action.errorText}</p>
          )}
        </div>
      </Wrapper>
    )
  }

  const busy = action.status === 'confirming'

  return (
    <Wrapper tone="default">
      <div className="flex flex-col gap-2">
        <Row>
          <span className="font-mono text-[10px] tracking-widest text-[#1A1A1A]">
            CONFIRM ACTION
          </span>
        </Row>
        <p className="text-sm text-[#1A1A1A] leading-snug">{action.label}</p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex-1 h-8 px-3 bg-[#1A1A1A] text-white text-xs font-medium rounded-lg hover:bg-[#333] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Doing it...' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="flex-1 h-8 px-3 bg-white border border-black/10 text-xs text-[#666] hover:text-[#1A1A1A] rounded-lg transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </Wrapper>
  )
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function Wrapper({
  tone,
  children,
}: {
  tone: 'default' | 'success' | 'error' | 'muted'
  children: React.ReactNode
}) {
  const toneClasses = {
    default: 'bg-[#F8F8F4] border border-black/10',
    success: 'bg-emerald-50 border border-emerald-200',
    error: 'bg-red-50 border border-red-200',
    muted: 'bg-[#F2F2EE] border border-black/5',
  }
  return (
    <div className={`mt-2 px-3 py-2.5 rounded-xl ${toneClasses[tone]}`}>{children}</div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className="text-emerald-600"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Result text builders ────────────────────────────────────────────────────

function buildResultText(action: string, result: unknown): string {
  if (!result || typeof result !== 'object') return 'Done.'
  const r = result as {
    id?: string
    title?: string
    status?: string
    name?: string
    fullName?: string
    url?: string
    number?: number
  }
  switch (action) {
    case 'create_task':
      return `Task created${r.title ? `: "${r.title}"` : ''}.`
    case 'create_ticket':
      return `Ticket raised${r.title ? `: "${r.title}"` : ''}.`
    case 'update_task_status':
      return `Task moved to ${r.status ?? 'new status'}.`
    case 'gh_create_repo':
      return `Repo created: ${r.fullName ?? r.name ?? '?'} — ${r.url ?? ''}`
    case 'gh_create_issue':
      return `Issue #${r.number ?? '?'} filed: "${r.title ?? ''}" — ${r.url ?? ''}`
    default:
      return 'Done.'
  }
}
