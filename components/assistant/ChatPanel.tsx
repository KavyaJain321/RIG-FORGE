'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAssistantStore } from '@/store/assistantStore'
import ForgieChat from './ForgieChat'

/**
 * Mobile/tablet Forgie overlay (below the `lg` 1024px breakpoint).
 *
 * On desktop, Forgie lives in the persistent ForgieDock pane, so this overlay
 * is wrapped in `lg:hidden` and never shows there. It keeps the original
 * slide-in drawer behaviour for narrow screens: toggled via the topbar's Ask
 * Forgie button, dismissed via the backdrop, Escape, or the header "X".
 */
export default function ChatPanel() {
  const { isOpen, close } = useAssistantStore()
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => setPortalReady(true), [])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  if (!isOpen || !portalReady) return null

  const content = (
    // lg:hidden ensures the overlay never renders on desktop, even if `isOpen`
    // is left true after resizing up from a narrow viewport.
    <div className="lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel — bg-[#FAFAF8] instead of pure white so the panel reads as
           part of the app's warm neutral system rather than a browser popup.
           panel-slide-in uses spring easing defined in globals.css. */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] bg-[#FAFAF8] shadow-2xl flex flex-col panel-slide-in"
        role="dialog"
        aria-label="Forgie chat"
      >
        <ForgieChat showClose onClose={close} />
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
