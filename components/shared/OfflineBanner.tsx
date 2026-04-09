'use client'

import { useState, useEffect } from 'react'

/**
 * OfflineBanner
 * Renders a fixed top banner when the browser detects network connectivity loss.
 * Uses the browser's online/offline events and navigator.onLine.
 * Automatically dismisses when the connection is restored.
 */
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false)
  const [justRestored, setJustRestored] = useState(false)

  useEffect(() => {
    // Set initial state
    setIsOffline(!navigator.onLine)

    function handleOffline() {
      setIsOffline(true)
      setJustRestored(false)
    }

    function handleOnline() {
      setIsOffline(false)
      setJustRestored(true)
      // Hide the "restored" message after 3 seconds
      setTimeout(() => setJustRestored(false), 3000)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!isOffline && !justRestored) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 text-xs font-mono tracking-widest',
        'transition-all duration-300',
        isOffline
          ? 'bg-status-danger text-white'
          : 'bg-status-success text-white',
      ].join(' ')}
    >
      {isOffline ? (
        <>
          <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse shrink-0" />
          <span>NO NETWORK CONNECTION — CHANGES MAY NOT SAVE</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-white/80 shrink-0" />
          <span>CONNECTION RESTORED</span>
        </>
      )}
    </div>
  )
}
