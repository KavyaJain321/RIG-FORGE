interface BadgeProps {
  label: string
  variant: 'role' | 'status' | 'default'
  value?: string
}

function getRoleClasses(value: string | undefined): string {
  if (value === 'ADMIN') return 'border-accent text-accent'
  return 'border-border-default text-muted'
}

function getStatusClasses(value: string | undefined): string {
  switch (value) {
    case 'ACTIVE':
    case 'AVAILABLE':
      return 'border-status-success text-status-success'
    case 'FOCUS':
    case 'IN_MEETING':
      return 'border-status-warning text-status-warning'
    default:
      return 'border-status-offline text-muted'
  }
}

export default function Badge({ label, variant, value }: BadgeProps) {
  let colorClasses: string

  switch (variant) {
    case 'role':
      colorClasses = getRoleClasses(value)
      break
    case 'status':
      colorClasses = getStatusClasses(value)
      break
    default:
      colorClasses = 'border-border-default text-muted'
  }

  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase ${colorClasses}`}
    >
      {label}
    </span>
  )
}
