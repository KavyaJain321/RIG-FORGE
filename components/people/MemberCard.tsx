'use client'

import Avatar from '@/components/ui/Avatar'
import StatusDot from '@/components/ui/StatusDot'
import Badge from '@/components/ui/Badge'
import type { MemberSummary } from '@/lib/types'

interface MemberCardProps {
  member: MemberSummary
  isSelected: boolean
  onClick: () => void
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: '● ACTIVE',
  FOCUS: '◎ FOCUS',
  AVAILABLE: '● AVAILABLE',
  IN_MEETING: '◎ IN MEETING',
  OFFLINE: '○ OFFLINE',
}

const PULSE_STATUSES = new Set(['ACTIVE', 'AVAILABLE'])

export default function MemberCard({ member, isSelected, onClick }: MemberCardProps) {
  const shouldPulse = PULSE_STATUSES.has(member.currentStatus)

  // Inline style override is required: forge-card's border CSS has higher cascade
  // priority than Tailwind utilities, so we bypass with inline style.
  const selectedStyle: React.CSSProperties = isSelected
    ? { borderColor: '#E8900A', borderTopColor: '#E8900A' }
    : {}

  return (
    <div
      className={`forge-card forge-row cursor-pointer p-5 ${isSelected ? 'forge-glow' : ''}`}
      style={selectedStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
    >
      {/* Top row: avatar + name/role */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar name={member.name} avatarUrl={member.avatarUrl} size="lg" />
          <span
            className={`absolute bottom-0 right-0 ${shouldPulse ? 'forge-pulse' : ''}`}
          >
            <StatusDot status={member.currentStatus} size="sm" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-primary font-bold truncate">
            {member.name}
          </p>
          <div className="mt-0.5">
            <Badge label={member.role} variant="role" value={member.role} />
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="mt-3">
        <p className="font-mono text-xs text-muted">
          {member.currentStatus === 'WORKING' ? '● WORKING' : '○ NOT WORKING'}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-border-default mt-3 mb-3" />

      {/* Stats row */}
      <div className="flex gap-6">
        <div>
          <p className="font-mono text-lg font-bold text-accent forge-text-glow leading-none">
            {member.projectCount}
          </p>
          <p className="font-mono text-[10px] text-muted tracking-widest uppercase mt-0.5">
            Projects
          </p>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-sm text-primary truncate leading-none">
            {member.role}
          </p>
          <p className="font-mono text-[10px] text-muted tracking-widest uppercase mt-0.5">
            Role
          </p>
        </div>
      </div>

      {/* Onboarding pill */}
      {member.isOnboarding && (
        <div className="mt-3 w-full px-2 py-1 text-center font-mono text-[10px] tracking-widest text-status-warning border border-status-warning/30 bg-status-warning/10">
          ONBOARDING IN PROGRESS 
        </div>
      )}
    </div>
  )
}
