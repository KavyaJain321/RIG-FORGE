'use client'

import { useAuthStore } from '@/store/authStore'
import ForgieChat from './ForgieChat'

/**
 * Desktop-only persistent Forgie pane. Always docked to the right edge as a
 * fixed-width column in the dashboard's flex layout — never an overlay, never
 * closeable. Below the `lg` (1024px) breakpoint it's hidden and the mobile
 * overlay (ChatPanel) takes over.
 *
 * Gated on the same condition as the topbar's Ask Forgie button so the pane
 * only appears for approved, signed-in users.
 */
export default function ForgieDock() {
  const { user } = useAuthStore()
  if (!user || user.mustChangePassword) return null

  return (
    <aside
      aria-label="Forgie chat"
      className="hidden lg:flex w-[380px] flex-shrink-0 sticky top-0 h-screen flex-col border-l border-border-default bg-surface-raised"
    >
      <ForgieChat />
    </aside>
  )
}
