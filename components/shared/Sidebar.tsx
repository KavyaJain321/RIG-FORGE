'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { isAdminRole } from '@/lib/auth'
import LogoutLogModal from '@/components/shared/LogoutLogModal'

// ─── Nav definitions ──────────────────────────────────────────────────────────

const ADMIN_NAV = [
  { href: '/dashboard',            label: 'Dashboard'   },
  { href: '/dashboard/projects',   label: 'Projects'    },
  { href: '/dashboard/people',     label: 'Team'        },
  { href: '/dashboard/tickets',    label: 'Tickets'     },
  { href: '/dashboard/reports',    label: 'Reports'     },
  { href: '/dashboard/onboarding', label: 'Onboarding'  },
] as const

const EMPLOYEE_NAV = [
  { href: '/dashboard',            label: 'Dashboard'   },
  { href: '/dashboard/projects',   label: 'My Projects' },
  { href: '/dashboard/people',     label: 'Team'        },
  { href: '/dashboard/tickets',    label: 'Tickets'     },
  { href: '/dashboard/profile',    label: 'My Profile'  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNavActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard') return pathname === '/dashboard'
  return pathname.startsWith(itemHref)
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface NavItemProps {
  href: string
  label: string
  active: boolean
  onClick?: () => void
}

function NavItem({ href, label, active, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        'flex items-center px-4 py-2.5 rounded text-sm font-medium tracking-wide transition-colors',
        active
          ? 'bg-accent/10 text-accent border-l-2 border-accent'
          : 'text-muted hover:text-foreground hover:bg-surface-raised border-l-2 border-transparent',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

interface AvatarCircleProps {
  name: string
  avatarUrl: string | null
}

function AvatarCircle({ name, avatarUrl }: AvatarCircleProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover shrink-0"
      />
    )
  }
  return (
    <span className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0 select-none">
      {getInitials(name)}
    </span>
  )
}

// ─── Sidebar inner content (shared between desktop & mobile drawer) ────────────

interface SidebarContentProps {
  onNavClick?: () => void
  onLogoutClick: () => void
}

function SidebarContent({ onNavClick, onLogoutClick }: SidebarContentProps) {
  const pathname = usePathname()
  useAuth() // populates authStore
  const { user } = useAuthStore()
  const navItems = user?.role && isAdminRole(user.role) ? ADMIN_NAV : EMPLOYEE_NAV

  return (
    <div className="flex flex-col h-full">
      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-7 pb-6">
        <p className="text-xs font-semibold tracking-widest text-accent uppercase">
          Governance Platform
        </p>
        <p className="text-xl font-bold mt-1 tracking-tight">Rig Forge</p>
        <hr className="border-border-default mt-4" />
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav className="px-3 flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {navItems.map(({ href, label }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            active={isNavActive(href, pathname)}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* ── User footer ───────────────────────────────────────────────── */}
      <div className="px-4 py-5 border-t border-border-default space-y-3">
        {user ? (
          <>
            {/* Status (read-only) */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className={[
                  'w-2 h-2 rounded-full shrink-0',
                  user.currentStatus === 'WORKING'
                    ? 'bg-status-success'
                    : 'bg-muted/50',
                ].join(' ')}
              />
              <span
                className={
                  user.currentStatus === 'WORKING'
                    ? 'text-status-success'
                    : 'text-muted'
                }
              >
                {user.currentStatus === 'WORKING' ? 'Working' : 'Not Working'}
              </span>
            </div>

            {/* Avatar + name + role */}
            <div className="flex items-center gap-3 min-w-0">
              <AvatarCircle name={user.name} avatarUrl={user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted">
                  {user.role === 'SUPER_ADMIN' ? 'Super Admin' : isAdminRole(user.role) ? 'Admin' : 'Employee'}
                </p>
              </div>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={onLogoutClick}
              className="text-xs text-muted hover:text-status-danger transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <div className="h-3 w-24 bg-background-tertiary rounded animate-pulse" />
            <div className="h-8 w-full bg-background-tertiary rounded animate-pulse" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const router = useRouter()
  const { clearUser } = useAuthStore()

  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile drawer on route change
  const pathname = usePathname()
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

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
      {/* ── Desktop Sidebar (lg+) ───────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col h-screen w-64 shrink-0 bg-surface-raised border-r border-border-default sticky top-0">
        <SidebarContent onLogoutClick={() => setShowLogoutModal(true)} />
      </aside>

      {/* ── Mobile Topbar (< lg) ────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-surface-raised border-b border-border-default">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-accent uppercase leading-none">
            Governance Platform
          </p>
          <p className="text-base font-bold tracking-tight leading-tight">Rig Forge</p>
        </div>
        <button
          type="button"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
          className="flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded hover:bg-border-default/30 transition-colors"
        >
          <span
            className={[
              'block w-5 h-0.5 bg-foreground transition-all duration-200',
              mobileOpen ? 'rotate-45 translate-y-2' : '',
            ].join(' ')}
          />
          <span
            className={[
              'block w-5 h-0.5 bg-foreground transition-all duration-200',
              mobileOpen ? 'opacity-0' : '',
            ].join(' ')}
          />
          <span
            className={[
              'block w-5 h-0.5 bg-foreground transition-all duration-200',
              mobileOpen ? '-rotate-45 -translate-y-2' : '',
            ].join(' ')}
          />
        </button>
      </div>

      {/* ── Mobile offset spacer so content isn't hidden under topbar ───── */}
      <div className="lg:hidden h-14 w-full shrink-0" aria-hidden="true" />

      {/* ── Mobile Drawer Overlay ───────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile Drawer Panel ─────────────────────────────────────────── */}
      <div
        className={[
          'lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-surface-raised border-r border-border-default',
          'transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Navigation drawer"
      >
        {/* Close button inside drawer */}
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded text-muted hover:text-foreground hover:bg-border-default/30 transition-colors"
        >
          ✕
        </button>
        <SidebarContent
          onNavClick={() => setMobileOpen(false)}
          onLogoutClick={() => { setShowLogoutModal(true); setMobileOpen(false) }}
        />
      </div>

      <LogoutLogModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onLogout={handleLogout}
      />
    </>
  )
}
