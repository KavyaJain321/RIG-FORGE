'use client'

import { useState } from 'react'
import type { ProjectDetail } from '@/lib/types'

type Member = ProjectDetail['members'][number]

interface MemberRowProps {
  projectId: string
  member: Member
  isAdmin: boolean
  currentUserId?: string
  onMemberClick?: (userId: string) => void
  onUpdateContribution: (userId: string, contribution: number) => void
  onRemoveMember: (userId: string) => void
}

function formatJoined(d: Date): string {
  return new Date(d as unknown as string).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export default function MemberRow({
  projectId: _projectId,
  member,
  isAdmin,
  currentUserId,
  onMemberClick,
  onRemoveMember,
}: Omit<MemberRowProps, 'onUpdateContribution'> & { onUpdateContribution?: (userId: string, contribution: number) => void }) {
  const [removeConfirm, setRemoveConfirm] = useState(false)

  const isOwnRow = member.userId === currentUserId
  // Admin can click any row; employees can only click their own
  const isClickable = isAdmin || isOwnRow

  function handleRowClick() {
    if (!isClickable || !onMemberClick) return
    onMemberClick(member.userId)
  }

  return (
    <div
      className={`flex items-center justify-between py-3 border-b border-border-default last:border-0 ${isClickable && onMemberClick ? 'cursor-pointer hover:bg-surface-raised/50 transition-colors rounded px-1' : ''}`}
      onClick={isClickable ? handleRowClick : undefined}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent shrink-0">
          {getInitials(member.name)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary">{member.name}</p>
            {member.isLead && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Lead</span>
            )}
            {isOwnRow && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/20 text-accent">YOU</span>
            )}
            <span className={`w-2 h-2 rounded-full shrink-0 ${member.currentStatus === 'WORKING' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          </div>
          <p className="text-xs text-text-muted">Joined {formatJoined(member.joinedAt)}</p>
        </div>
      </div>

      {isAdmin && !member.isLead && (
        <div onClick={(e) => e.stopPropagation()}>
          {removeConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Remove?</span>
              <button
                onClick={() => { onRemoveMember(member.userId); setRemoveConfirm(false) }}
                className="text-xs text-red-600 hover:text-red-700 font-medium"
              >
                Yes
              </button>
              <button onClick={() => setRemoveConfirm(false)} className="text-xs text-text-muted hover:text-text-primary">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setRemoveConfirm(true)}
              className="text-xs text-text-muted hover:text-red-600 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}
