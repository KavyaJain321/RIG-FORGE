interface TicketStatusBadgeProps { status: string }

const CONFIG: Record<string, { label: string; className: string }> = {
  OPEN:      { label: 'OPEN',      className: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' },
  ACCEPTED:  { label: 'ACCEPTED',  className: 'text-blue-400 border-blue-400/30 bg-blue-400/10' },
  COMPLETED: { label: 'COMPLETED', className: 'text-green-400 border-green-400/30 bg-green-400/10' },
  CANCELLED: { label: 'CANCELLED', className: 'text-text-muted border-border-default bg-background-tertiary' },
}

export default function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  const cfg = CONFIG[status] ?? CONFIG.OPEN
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[10px] tracking-widest ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
