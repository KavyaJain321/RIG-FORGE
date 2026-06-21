'use client'

/**
 * WhatsApp number + OTP verification widget.
 *
 * Drives /api/users/me/whatsapp/start-verification and /verify. Used on the
 * profile page and inside the dashboard setup prompt. A number only becomes the
 * user's resolvable WhatsApp number after the code is confirmed.
 */

import { useState } from 'react'
import type { ApiResponse } from '@/lib/types'

interface Props {
  /** Current resolvable number (may be unverified for legacy rows). */
  whatsappNumber: string | null
  verified: boolean
  /** Called after a successful verify or clear, so the parent can refetch. */
  onChange?: () => void
}

type Step = 'idle' | 'enter-number' | 'enter-code'

export default function WhatsappVerifyCard({ whatsappNumber, verified, onChange }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [number, setNumber] = useState(whatsappNumber ?? '')
  const [maskedNumber, setMaskedNumber] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function startVerification(num: string) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/users/me/whatsapp/start-verification', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: num }),
      })
      const json = (await res.json()) as ApiResponse<{ maskedNumber: string }>
      if (!res.ok) {
        setError(json.error ?? 'Could not send the code')
        return
      }
      setMaskedNumber(json.data?.maskedNumber ?? '')
      setCode('')
      setStep('enter-code')
      setInfo('We sent a 6-digit code to your WhatsApp.')
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  async function submitCode() {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/users/me/whatsapp/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = (await res.json()) as ApiResponse<{ whatsappNumber: string }>
      if (!res.ok) {
        setError(json.error ?? 'Could not verify the code')
        return
      }
      setStep('idle')
      setInfo('✓ WhatsApp number verified.')
      onChange?.()
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  async function clearNumber() {
    if (!confirm('Remove your WhatsApp number? Forgie will no longer message you there.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/me/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappNumber: null }),
      })
      if (!res.ok) {
        const json = (await res.json()) as ApiResponse<unknown>
        setError(json.error ?? 'Could not remove the number')
        return
      }
      setNumber('')
      setStep('idle')
      setInfo('Number removed.')
      onChange?.()
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  const btn =
    'font-mono text-xs border border-border-default px-4 py-2 text-text-muted tracking-widest hover:border-accent hover:text-accent-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const inputCls =
    'w-full bg-background-primary border border-border-default font-mono text-xs text-text-primary placeholder:text-text-muted p-3 focus:outline-none focus:border-accent transition-colors'

  // ── Idle: show status + entry points ─────────────────────────────────────
  if (step === 'idle') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-xs flex items-center gap-2">
            {whatsappNumber ? (
              <>
                <span className="text-text-primary">{whatsappNumber}</span>
                {verified ? (
                  <span className="text-accent-ink tracking-widest text-[10px]">✓ VERIFIED</span>
                ) : (
                  <span className="text-status-warning tracking-widest text-[10px]">UNVERIFIED</span>
                )}
              </>
            ) : (
              <span className="text-text-muted italic">Not set</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {whatsappNumber && !verified && (
              <button type="button" disabled={busy} onClick={() => void startVerification(whatsappNumber)} className={btn}>
                VERIFY
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setNumber(whatsappNumber ?? '')
                setError(null)
                setInfo(null)
                setStep('enter-number')
              }}
              className={btn}
            >
              {whatsappNumber ? 'CHANGE' : 'ADD NUMBER'}
            </button>
            {whatsappNumber && (
              <button type="button" disabled={busy} onClick={() => void clearNumber()} className={btn}>
                REMOVE
              </button>
            )}
          </div>
        </div>
        {info && <p className="font-mono text-[10px] text-accent-ink tracking-widest">{info}</p>}
        {error && <p className="font-mono text-[10px] text-status-danger">{error}</p>}
      </div>
    )
  }

  // ── Enter number ─────────────────────────────────────────────────────────
  if (step === 'enter-number') {
    return (
      <div className="space-y-3">
        <input
          type="tel"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+919876543210"
          inputMode="tel"
          autoComplete="tel"
          className={inputCls}
        />
        <p className="font-mono text-[10px] text-text-muted">
          E.164 with country code, e.g. <span className="text-text-secondary">+919876543210</span>.
          A bare 10-digit number is treated as Indian (+91). We'll WhatsApp you a 6-digit code.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button type="button" disabled={busy || number.trim() === ''} onClick={() => void startVerification(number)} className={btn}>
            {busy ? 'SENDING…' : 'SEND CODE'}
          </button>
          <button type="button" disabled={busy} onClick={() => { setStep('idle'); setError(null) }} className="font-mono text-xs text-text-muted tracking-widest hover:text-text-primary transition-colors disabled:opacity-40">
            CANCEL
          </button>
          {error && <span className="font-mono text-[10px] text-status-danger">{error}</span>}
        </div>
      </div>
    )
  }

  // ── Enter code ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] text-text-muted">
        Enter the 6-digit code sent to <span className="text-text-secondary">{maskedNumber}</span>.
      </p>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="••••••"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className={`${inputCls} tracking-[0.5em] text-center`}
      />
      {info && <p className="font-mono text-[10px] text-accent-ink tracking-widest">{info}</p>}
      {error && <p className="font-mono text-[10px] text-status-danger">{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" disabled={busy || code.length !== 6} onClick={() => void submitCode()} className={btn}>
          {busy ? 'VERIFYING…' : 'VERIFY'}
        </button>
        <button type="button" disabled={busy} onClick={() => void startVerification(number)} className="font-mono text-xs text-text-muted tracking-widest hover:text-text-primary transition-colors disabled:opacity-40">
          RESEND
        </button>
        <button type="button" disabled={busy} onClick={() => { setStep('enter-number'); setError(null); setInfo(null) }} className="font-mono text-xs text-text-muted tracking-widest hover:text-text-primary transition-colors disabled:opacity-40">
          CHANGE NUMBER
        </button>
      </div>
    </div>
  )
}
