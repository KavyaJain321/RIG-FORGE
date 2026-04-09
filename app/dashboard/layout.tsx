import type { Metadata } from 'next'

import Topbar from '@/components/shared/Topbar'

export const metadata: Metadata = {
  title: {
    template: '%s — Rig Forge',
    default: 'Rig Forge',
  },
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#EAEAE4]">
      <Topbar />
      <main className="min-h-screen pt-14 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
