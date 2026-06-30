'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/lib/auth'
import AdminDashboard from '@/components/dashboard/AdminDashboard'
import EmployeeDashboard from '@/components/dashboard/EmployeeDashboard'

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background-primary p-4 sm:p-6 md:p-8">
      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="min-w-0">
          <div className="shimmer h-4 w-24 mb-3" />
          <div className="shimmer h-8 w-56 max-w-[60vw] mb-2" />
          <div className="shimmer h-3 w-40 max-w-[50vw]" />
        </div>
        <div className="shimmer h-4 w-28 sm:w-48 shrink-0" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="shimmer h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="shimmer h-[300px] sm:h-[400px] rounded-2xl" />
        <div className="shimmer h-[300px] sm:h-[400px] rounded-2xl" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user === null) {
      router.push('/login')
    }
  }, [loading, user, router])

  if (loading) return <LoadingSkeleton />
  if (user === null) return null

  if (isAdminRole(user.role)) {
    return <AdminDashboard user={user} />
  }

  return <EmployeeDashboard user={user} />
}
