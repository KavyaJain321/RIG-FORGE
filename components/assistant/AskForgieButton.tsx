'use client'

import { useAssistantStore } from '@/store/assistantStore'

/**
 * Topbar button that opens Forgie's mobile chat overlay.
 * Sits to the LEFT of the notification bell.
 *
 * Hidden on desktop (`lg:hidden`): at ≥1024px Forgie is a persistent docked
 * pane (ForgieDock), so a toggle would be a no-op there.
 */
export default function AskForgieButton() {
  const { isOpen, toggle } = useAssistantStore()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isOpen ? 'Close Forgie' : 'Ask Forgie'}
      title="Ask Forgie (AI assistant)"
      className={[
        'lg:hidden flex items-center gap-1.5 h-9 px-3',
        'border border-border-default rounded-full',
        'font-mono text-xs tracking-widest uppercase',
        'transition-colors duration-150',
        isOpen
          ? 'bg-[#1A1A1A] text-[#FAFAFA] border-[#1A1A1A]'
          : 'bg-surface-raised/70 text-text-secondary hover:bg-surface-raised hover:text-text-primary',
      ].join(' ')}
    >
      <SparkIcon />
      <span className="hidden sm:inline">Forgie</span>
    </button>
  )
}

function SparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 4-point sparkle */}
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M5.6 18.4l2.1-2.1" />
      <path d="M16.3 7.7l2.1-2.1" />
    </svg>
  )
}
