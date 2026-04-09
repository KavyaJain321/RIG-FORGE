import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

type ButtonVariant = 'default' | 'subtle' | 'critical' | 'gov-emphasis'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClass: Record<ButtonVariant, string> = {
  default:
    'bg-accent text-background-primary border-accent hover:bg-accent-hover active:bg-accent-pressed',
  subtle:
    'bg-transparent text-text-secondary border-border-default hover:border-accent hover:text-text-primary',
  critical:
    'bg-status-danger/10 text-status-danger border-status-danger/40 hover:bg-status-danger/20',
  'gov-emphasis':
    'bg-surface-highlight text-accent border-accent/60 shadow-elevation-1 hover:bg-accent/10',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[10px] tracking-[0.12em]',
  md: 'px-4 py-2.5 text-xs tracking-[0.16em]',
  lg: 'px-6 py-3 text-sm tracking-[0.18em]',
}

export default function Button({
  className,
  variant = 'default',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'font-mono uppercase border rounded-card transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  )
}
