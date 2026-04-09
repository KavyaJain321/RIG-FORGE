import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

interface DataRowProps {
  label: string
  value: ReactNode
  className?: string
}

export default function DataRow({ label, value, className }: DataRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2 border-b border-border-subtle', className)}>
      <span className="type-meta text-text-muted">{label}</span>
      <span className="type-body-sm text-text-primary text-right">{value}</span>
    </div>
  )
}
