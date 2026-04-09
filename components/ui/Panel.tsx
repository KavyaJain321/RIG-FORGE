import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

interface PanelProps {
  children: ReactNode
  className?: string
}

export default function Panel({ children, className }: PanelProps) {
  return <div className={cn('surface-panel p-5', className)}>{children}</div>
}
