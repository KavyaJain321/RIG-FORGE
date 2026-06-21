import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

type ButtonVariant = 'default' | 'subtle' | 'critical' | 'primary' | 'gov-emphasis'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

// ── Variant system ────────────────────────────────────────────────────────────
//
// primary     — The single most important CTA on a screen. Solid black fill.
//               Maximum authority. Use at most once per view.
//
// default     — Accent-colored action (lime). Secondary confirms, positive
//               state changes. text-[#1A1A1A] on lime = 11.97:1 contrast ✓
//               (was text-background-primary = #EAEAE4 on lime = 1.45:1 — fixed)
//
// subtle      — Ghost / tertiary. Appears on hover.
//
// critical    — Destructive. Red-tinted, not screaming red.
//
// gov-emphasis — Kept as alias for `primary` for backward compatibility.

const variantClass: Record<ButtonVariant, string> = {
  // Solid black — commanding authority for the primary CTA
  primary:
    'bg-primary text-white border-transparent hover:bg-[#2A2A2A]',

  // Backward-compatible alias
  'gov-emphasis':
    'bg-primary text-white border-transparent hover:bg-[#2A2A2A]',

  // Lime with legible black text (contrast 11.97:1 vs prior 1.45:1)
  default:
    'bg-accent text-primary border-transparent hover:bg-accent-hover',

  // Ghost
  subtle:
    'bg-transparent text-text-secondary border-border-default hover:border-border-strong hover:text-text-primary',

  // Destructive
  critical:
    'bg-status-danger/8 text-status-danger border-status-danger/30 hover:bg-status-danger/15',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[10px] tracking-[0.12em]',
  md: 'h-9 px-4 text-xs tracking-[0.16em]',
  lg: 'h-11 px-6 text-sm tracking-[0.18em]',
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
        'inline-flex items-center justify-center font-mono uppercase border rounded-card',
        'transition-colors duration-150',
        // Tactile press — GPU-accelerated scale, instant so it feels physical
        'active:scale-[0.97] active:transition-none',
        // Focus ring from globals.css :focus-visible handles the base case,
        // but override here to match the component's surface context
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  )
}
