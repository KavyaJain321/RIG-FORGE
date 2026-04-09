import type { InputHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
}

export default function Input({ className, label, error, id, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block type-meta mb-2 text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full bg-surface-raised border border-border-default rounded-card',
          'px-4 py-3 type-body placeholder:text-text-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary focus-visible:border-accent',
          error && 'border-status-danger',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-2 text-[11px] font-mono text-status-danger">{error}</p>}
    </div>
  )
}
