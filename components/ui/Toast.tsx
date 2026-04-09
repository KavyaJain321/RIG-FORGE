'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ToastItem {
  id: string
  type: 'success' | 'error'
  message: string
}

function ToastSingle({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  useEffect(() => {
    const ms = item.type === 'success' ? 3000 : 4000
    const t = window.setTimeout(() => {
      setExiting(true)
      window.setTimeout(onDismiss, 150)
    }, ms)
    return () => window.clearTimeout(t)
  }, [item.type, onDismiss])

  function handleDismiss() {
    setExiting(true)
    window.setTimeout(onDismiss, 150)
  }

  const border =
    item.type === 'success' ? 'border-l-status-success' : 'border-l-status-danger'
  const prefix =
    item.type === 'success' ? (
      <span className="text-status-success">[ ✓ ] </span>
    ) : (
      <span className="text-status-danger">[ ! ] </span>
    )

  return (
    <div
      className={`flex items-start gap-3 bg-background-secondary border border-border-default ${border} border-l-[3px] px-4 py-3 max-w-md shadow-lg transition-all duration-150 ease-out ${
        exiting
          ? 'translate-y-full opacity-0'
          : mounted
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0'
      }`}
    >
      <p className="flex-1 font-mono text-xs text-primary leading-snug">
        {prefix}
        {item.message}
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="font-mono text-muted hover:text-primary shrink-0 leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

export function ToastHost({
  toasts,
  removeToast,
}: {
  toasts: ToastItem[]
  removeToast: (id: string) => void
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])
  if (!ready || typeof document === 'undefined') return null
    
  return createPortal(
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastSingle item={t} onDismiss={() => removeToast(t.id)} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
