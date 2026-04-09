import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  subline: string
  action?: ReactNode
}

export default function EmptyState({ title, subline, action }: EmptyStateProps) {
  return (
    <div className="surface-card py-12 px-6 text-center">
      <p className="type-h3">{title}</p>
      <p className="type-body-muted mt-2">{subline}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
