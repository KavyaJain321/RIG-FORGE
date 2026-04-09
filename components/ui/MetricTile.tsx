import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'

interface MetricTileProps {
  label: string
  value: ReactNode
  tone?: 'default' | 'accent' | 'danger' | 'success'
}

const toneClass: Record<NonNullable<MetricTileProps['tone']>, string> = {
  default: 'text-text-primary',
  accent: 'text-accent',
  danger: 'text-status-danger',
  success: 'text-status-success',
}

export default function MetricTile({
  label,
  value,
  tone = 'default',
}: MetricTileProps) {
  return (
    <Card className="min-w-[160px]">
      <p className="type-meta text-text-muted mb-1">{label}</p>
      <p className={`font-display text-h1 ${toneClass[tone]}`}>{value}</p>
    </Card>
  )
}
