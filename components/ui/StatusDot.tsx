// Status indicator dot — maps UserStatus string to a colored circle.
// Accepts string (not Prisma enum) because AuthUser.currentStatus is typed string.

interface StatusDotProps {
  status: string
  size?: 'sm' | 'md' | 'lg'
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'bg-status-success',
  FOCUS: 'bg-status-warning',
  AVAILABLE: 'bg-status-success',
  IN_MEETING: 'bg-status-warning',
  OFFLINE: 'bg-status-offline',
}

const SIZE_CLASS: Record<NonNullable<StatusDotProps['size']>, string> = {
  sm: 'w-1.5 h-1.5', // 6px
  md: 'w-2 h-2',     // 8px
  lg: 'w-2.5 h-2.5', // 10px
}

export default function StatusDot({ status, size = 'md' }: StatusDotProps) {
  const color = STATUS_COLOR[status] ?? 'bg-status-offline'
  const sizeClass = SIZE_CLASS[size]

  return (
    <span
      className={`inline-block rounded-full shrink-0 ${color} ${sizeClass}`}
      aria-label={`Status: ${status.toLowerCase().replace('_', ' ')}`}
    />
  )
}
