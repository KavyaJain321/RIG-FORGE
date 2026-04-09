'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { useSocket } from '@/hooks/useSocket'
import Avatar from '@/components/ui/Avatar'
import StatusDot from '@/components/ui/StatusDot'
import NotificationBell from '@/components/notifications/NotificationBell'
import NotificationDropdown from '@/components/notifications/NotificationDropdown'

// ─── Nav config ───────────────────────────────────────────────────────────────

const ADMIN_NAV = [
  { href: '/dashboard', label: 'DASHBOARD' },
  { href: '/dashboard/projects', label: 'PROJECTS' },
  { href: '/dashboard/people', label: 'PEOPLE' },
  { href: '/dashboard/tickets', label: 'TICKETS' },
  { href: '/dashboard/reports', label: 'REPORTS' },
  { href: '/dashboard/onboarding', label: 'ONBOARDING' },
] as const

const EMPLOYEE_NAV = [
  { href: '/dashboard', label: 'DASHBOARD' },
  { href: '/dashboard/projects', label: 'MY PROJECTS' },
  { href: '/dashboard/people', label: 'PEOPLE' },
  { href: '/dashboard/tickets', label: 'TICKETS' },
  { href: '/dashboard/profile', label: 'MY PROFILE' },
] as const

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'FOCUS', label: 'FOCUS' },
  { value: 'AVAILABLE', label: 'AVAILABLE' },
  { value: 'IN_MEETING', label: 'IN MEETING' },
  { value: 'OFFLINE', label: 'OFFLINE' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNavActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard') return pathname === '/dashboard'
  return pathname.startsWith(itemHref)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  useAuth()
  const { user, clearUser } = useAuthStore()
  useSocket()

  const navItems = user?.role === 'ADMIN' ? ADMIN_NAV : EMPLOYEE_NAV

  const [statusOpen, setStatusOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [displayStatus, setDisplayStatus] = useState<string>('OFFLINE')
  const statusRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mobileNavRef = useRef<HTMLDivElement>(null)

  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    if (user?.currentStatus) setDisplayStatus(user.currentStatus)
  }, [user?.currentStatus])

  useEffect(() => { setPortalReady(true) }, [])

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!statusOpen && !userMenuOpen && !mobileNavOpen) return

    function handleClickOutside(e: MouseEvent): void {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) {
        setMobileNavOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [statusOpen, userMenuOpen, mobileNavOpen])

  function handleStatusSelect(status: string): void {
    setDisplayStatus(status)
    setStatusOpen(false)
    // TODO (P06): PATCH /api/users/me/status — endpoint not yet implemented
    console.log('TODO P06 PATCH /api/users/me/status →', status)
  }

  async function handleLogout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Network error — clear local state and redirect regardless
    }
    clearUser()
    router.push('/login')
  }

  return (
    <>
      <header className="topbar">

        {/* ── Logo mark ───────────────────────────────────────────────────── */}
        <Link href="/dashboard" className="topbar-brand" title="Rig Forge">
          RF
        </Link>

        {/* ── Mobile nav (hamburger) ─────────────────────────────────────── */}
        <div className="relative lg:hidden" ref={mobileNavRef}>
          <button
            type="button"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="h-9 px-3 rounded-full border border-black/10 bg-white/70 hover:bg-white transition-colors font-mono text-xs text-[#555555]"
          >
            {mobileNavOpen ? 'CLOSE' : 'MENU'}
          </button>

          {mobileNavOpen && (
            <div className="topbar-dropdown left-0 right-auto min-w-[220px]">
              {navItems.map(({ href, label }) => {
                const active = isNavActive(href, pathname)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={[
                      'topbar-dropdown-item',
                      active ? 'font-semibold text-[#1A1A1A]' : '',
                    ].join(' ')}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Navigation tabs (desktop only) ──────────────────────────────── */}
        <nav className="topbar-nav">
          {navItems.map(({ href, label }) => {
            const active = isNavActive(href, pathname)

            return (
              <div key={href} className="flex items-center">
                <Link
                  href={href}
                  className={`topbar-link${active ? ' topbar-link--active' : ''}`}
                >
                  {label}
                </Link>
              </div>
            )
          })}
        </nav>

        {/* ── Right controls ──────────────────────────────────────────────── */}
        <div className="topbar-controls">

          {/* Notification bell */}
          <NotificationBell
            ref={bellRef}
            onClick={() => setBellOpen((prev) => !prev)}
            isOpen={bellOpen}
          />

          {user && (
            <>
              {/* Status selector */}
              <div className="relative hidden sm:block" ref={statusRef}>
                <button
                  type="button"
                  onClick={() => setStatusOpen((prev) => !prev)}
                  className="topbar-status-btn"
                >
                  <StatusDot status={displayStatus} size="sm" />
                  <span>{displayStatus.replace('_', ' ')}</span>
                </button>

                {statusOpen && (
                  <div className="topbar-dropdown">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleStatusSelect(opt.value)}
                        className="topbar-dropdown-item"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="topbar-avatar-btn"
                >
                  <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
                  <span className="hidden md:inline font-mono text-xs text-text-secondary">
                    {user.name}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="topbar-dropdown">
                    <div className="px-3 py-2.5 border-b border-border-default">
                      <p className="font-mono text-xs text-text-primary">{user.name}</p>
                      <p className="font-mono text-[10px] text-text-muted uppercase tracking-widest mt-0.5">
                        {user.role}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="topbar-dropdown-item text-status-danger hover:text-status-danger"
                    >
                      ▸ SIGN OUT
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Notification dropdown (portal) ──────────────────────────────── */}
      {portalReady && createPortal(
        <NotificationDropdown
          isOpen={bellOpen}
          onClose={() => setBellOpen(false)}
          bellRef={bellRef}
        />,
        document.body
      )}
    </>
  )
}
