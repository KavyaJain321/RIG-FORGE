import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

interface CardProps {
  children: ReactNode
  className?: string
}

export default function Card({ children, className }: CardProps) {
  return <div className={cn('surface-card p-4 md:p-5', className)}>{children}</div>
}
