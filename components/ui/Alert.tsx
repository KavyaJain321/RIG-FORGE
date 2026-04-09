import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

type AlertVariant = 'error' | 'success' | 'info'

interface AlertProps {
  children: ReactNode
  variant?: AlertVariant
  className?: string
}

const variantClass: Record<AlertVariant, string> = {
  error: 'border-status-danger/40 bg-status-danger/10 text-status-danger',
  success: 'border-status-success/40 bg-status-success/10 text-status-success',
  info: 'border-border-strong bg-surface-raised text-text-secondary',
}

export default function Alert({ children, variant = 'info', className }: AlertProps) {
  return (
    <div className={cn('border rounded-card px-4 py-3 font-mono text-xs', variantClass[variant], className)}>
      {children}
    </div>
  )
}
