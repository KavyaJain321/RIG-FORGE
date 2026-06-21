'use client'

import { useEffect, useState } from 'react'

/**
 * Light/dark theme toggle. Flips the `dark` class on <html> and persists the
 * choice to localStorage. The initial class is set pre-paint by the inline
 * script in app/layout.tsx (no flash of wrong theme).
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    setMounted(true)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    const root = document.documentElement
    if (next) root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch { /* ignore */ }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title="Toggle light / dark theme"
      className="flex items-center justify-center h-9 w-9 rounded-full border border-border-default bg-surface-raised/70 text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
    >
      {/* Render a neutral icon until mounted to avoid hydration mismatch */}
      {mounted && dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}
