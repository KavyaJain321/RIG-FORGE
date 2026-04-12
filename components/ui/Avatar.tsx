// Reusable avatar component — shows image or initials fallback.
// Always circular. Optional amber ring when active prop is set.

interface AvatarProps {
  name: string
  avatarUrl: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  active?: boolean
}

interface SizeConfig {
  container: string
  text: string
}

const SIZE_CONFIG: Record<NonNullable<AvatarProps['size']>, SizeConfig> = {
  sm: { container: 'w-6 h-6',   text: 'text-[10px]' }, // 24px
  md: { container: 'w-8 h-8',   text: 'text-xs' },     // 32px
  lg: { container: 'w-10 h-10', text: 'text-sm' },     // 40px
  xl: { container: 'w-14 h-14', text: 'text-base' },   // 56px
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  const first = parts[0][0] ?? ''
  const last = parts[parts.length - 1][0] ?? ''
  return (first + last).toUpperCase()
}

export default function Avatar({
  name,
  avatarUrl,
  size = 'md',
  active = false,
}: AvatarProps) {
  const { container, text } = SIZE_CONFIG[size]
  const ring = active
    ? 'ring-2 ring-accent ring-offset-1 ring-offset-background-primary'
    : ''

  if (avatarUrl) {
    return (
      <div className={`${container} ${ring} rounded-full overflow-hidden shrink-0`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className={`${container} ${ring} rounded-full bg-background-tertiary flex items-center justify-center shrink-0`}
      aria-label={name}
      title={name}
    >
      <span className={`${text} font-mono text-text-secondary font-medium select-none`}>
        {getInitials(name)}
      </span>
    </div>
  )
}
