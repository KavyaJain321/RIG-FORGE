import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

interface Option {
  value: string
  label: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: Option[]
  label?: string
}

export default function Select({ className, options, label, id, ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block type-meta mb-2 text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={cn(
            'w-full appearance-none bg-surface-raised border border-border-default rounded-card',
            'px-3 py-2.5 pr-8 type-body-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary focus-visible:border-accent',
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
          ▾
        </span>
      </div>
    </div>
  )
}
