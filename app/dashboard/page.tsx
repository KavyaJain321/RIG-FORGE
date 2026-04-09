'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import AdminDashboard from '@/components/dashboard/AdminDashboard'
import EmployeeDashboard from '@/components/dashboard/EmployeeDashboard'

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#EAEAE4] p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="shimmer h-4 w-24 mb-3" />
          <div className="shimmer h-8 w-56 mb-2" />
          <div className="shimmer h-3 w-40" />
        </div>
        <div className="shimmer h-4 w-48" />
      </div>
      <div className="flex gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="shimmer flex-1 h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="shimmer h-[400px] rounded-2xl" />
        <div className="shimmer h-[400px] rounded-2xl" />
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

  if (user.role === 'ADMIN') {
    return <AdminDashboard user={user} />
  }

  return <EmployeeDashboard user={user} />
}
