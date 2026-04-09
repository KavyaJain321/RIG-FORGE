'use client'

import { useRouter } from 'next/navigation'

import ContributionBar from '@/components/ui/ContributionBar'
import ProjectTabs from '@/components/projects/detail/ProjectTabs'
import type { ProjectDetail } from '@/lib/types'

function ProjectStatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    ACTIVE: 'border-status-success text-status-success',
    ON_HOLD: 'border-status-warning text-status-warning',
    COMPLETED: 'border-border-default text-muted',
    ARCHIVED: 'border-border-default text-muted italic',
  }
  const cls = classes[status] ?? 'border-border-default text-muted'
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase ${cls}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const classes: Record<string, string> = {
    CRITICAL: 'border-status-danger text-status-danger',
    HIGH: 'border-accent text-accent',
    MEDIUM: 'border-border-default text-secondary',
    LOW: 'border-border-default text-muted',
  }
  const cls = classes[priority] ?? 'border-border-default text-muted'
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase ${cls}`}
    >
      {priority}
    </span>
  )
}

function getDeadlineDisplay(deadline: Date | null): { text: string; className: string } {
  if (!deadline) return { text: '—', className: 'text-muted' }
  const d = new Date(deadline as unknown as string)
  const diffDays = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const formatted = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (diffDays < 0) return { text: `✕ ${formatted}`, className: 'text-status-danger' }
  if (diffDays <= 7) return { text: `⚠ ${formatted}`, className: 'text-status-warning' }
  return { text: formatted, className: 'text-secondary' }
}

interface ProjectHeaderProps {
  project: ProjectDetail
  isAdmin: boolean
  onEditClick: () => void
  onAddMemberClick: () => void
}

export default function ProjectHeader({
  project,
  isAdmin,
  onEditClick,
  onAddMemberClick,
}: ProjectHeaderProps) {
  const router = useRouter()
  const deadline = getDeadlineDisplay(project.deadline)

  return (
    <header className="w-full bg-background-secondary border-b border-border-default px-8 pt-6 pb-0">
      {/* Row 1 */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => router.push('/dashboard/projects')}
          className="font-mono text-xs text-muted tracking-widest hover:text-accent cursor-pointer text-left"
        >
          ← PROJECTS
        </button>
        {isAdmin && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onEditClick}
              className="border border-border-default text-secondary font-mono text-xs tracking-widest px-4 py-2 hover:border-accent hover:text-accent transition-colors duration-150"
            >
              ✎ EDIT PROJECT
            </button>
            <button
              type="button"
              onClick={onAddMemberClick}
              className="border border-border-default text-secondary font-mono text-xs tracking-widest px-4 py-2 hover:border-accent hover:text-accent transition-colors duration-150"
            >
              ⊕ ADD MEMBER
            </button>
          </div>
        )}
      </div>

      {/* Row 2 */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1 pr-4">
          <h1 className="font-mono font-black text-3xl text-primary tracking-tight leading-none">
            {project.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <ProjectStatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.deadline && (
              <span className={`font-mono text-xs ${deadline.className}`}>{deadline.text}</span>
            )}
          </div>
        </div>
        <div className="w-64 shrink-0">
          <p className="font-mono text-[10px] text-muted tracking-widest mb-2">OVERALL PROGRESS</p>
          <ContributionBar value={project.totalTasks > 0 ? Math.round((project.doneTasks / project.totalTasks) * 100) : 0} showPercentage={false} />
          <p className="font-mono text-xs text-secondary mt-1">
            {project.doneTasks} of {project.totalTasks} tasks complete
          </p>
        </div>
      </div>

      {/* Row 3 — description */}
      {project.description ? (
        <p className="text-secondary text-sm max-w-2xl mb-4">{project.description}</p>
      ) : null}

      {/* Tabs */}
      <ProjectTabs />
    </header>
  )
}
