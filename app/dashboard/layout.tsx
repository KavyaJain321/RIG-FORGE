import type { Metadata } from 'next'

import Topbar from '@/components/shared/Topbar'
import MobileNav from '@/components/shared/MobileNav'
import ForgieDock from '@/components/assistant/ForgieDock'
import { APP_NAME } from '@/lib/branding'

export const metadata: Metadata = {
  title: {
    template: `%s — ${APP_NAME}`,
    default: APP_NAME,
  },
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Top-level split: main column flexes to fill width, ForgieDock is a
    // fixed-width persistent pane on the right (desktop only). min-w-0 lets the
    // main column shrink below its content width so the dock can't be pushed off.
    <div className="flex min-h-screen bg-background-primary">
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        {/* Bottom padding on mobile clears the fixed bottom nav (hidden on lg+). */}
        <main className="flex-1 min-w-0 pb-14 lg:pb-0">
          {children}
        </main>
      </div>
      <ForgieDock />
      <MobileNav />
    </div>
  )
}
