import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export default function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="type-h3 text-text-primary">{title}</h2>
        {subtitle && <p className="type-body-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
