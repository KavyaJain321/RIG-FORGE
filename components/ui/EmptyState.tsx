import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  subline: string
  action?: ReactNode
  icon?: ReactNode
}

export default function EmptyState({ title, subline, action, icon }: EmptyStateProps) {
  return (
    <div className="surface-card py-14 px-8 text-center flex flex-col items-center">
      {icon && (
        <div className="mb-5 flex items-center justify-center w-12 h-12 rounded-full bg-background-secondary border border-border-subtle">
          <span className="text-text-muted">{icon}</span>
        </div>
      )}
      {!icon && (
        /* Default: a minimal, brand-consistent dot grid — signals "nothing here"
           without resorting to illustrations that look out of place in tooling */
        <div className="mb-5 flex items-center justify-center w-12 h-12 rounded-full bg-background-secondary border border-border-subtle">
          <span className="font-mono text-[10px] tracking-widest text-text-muted opacity-60">—</span>
        </div>
      )}
      <p className="type-h3 text-text-primary">{title}</p>
      <p className="type-body-muted mt-2 max-w-[280px] mx-auto leading-relaxed">{subline}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
