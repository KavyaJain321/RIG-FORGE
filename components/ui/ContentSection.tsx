import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

interface ContentSectionProps {
  children: ReactNode
  className?: string
}

export default function ContentSection({ children, className }: ContentSectionProps) {
  return <section className={cn('section-block', className)}>{children}</section>
}
