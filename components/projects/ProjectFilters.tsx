'use client'

import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

interface ProjectFiltersProps {
  search: string
  status: string
  priority: string
  total: number
  isAdmin: boolean
  onSearchChange: (v: string) => void
  onStatusChange: (v: string) => void
  onPriorityChange: (v: string) => void
  onCreateClick: () => void
}

export default function ProjectFilters({
  search,
  status,
  priority,
  total,
  isAdmin,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onCreateClick,
}: ProjectFiltersProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 bg-surface-raised border-b border-border-default">
      {/* Search */}
      <div className="relative w-[280px] shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted text-sm select-none pointer-events-none">
          ⌕
        </span>
        <Input
          type="text"
          aria-label="Search projects"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="SEARCH PROJECTS..."
          className="pl-8 pr-8 py-2 text-xs"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-muted hover:text-primary text-xs leading-none"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="relative w-[160px] shrink-0">
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          options={[
            { value: '', label: 'ALL STATUS' },
            { value: 'ACTIVE', label: 'ACTIVE' },
            { value: 'ON_HOLD', label: 'ON HOLD' },
            { value: 'COMPLETED', label: 'COMPLETED' },
            { value: 'ARCHIVED', label: 'ARCHIVED' },
          ]}
          className="text-xs"
        />
      </div>

      {/* Priority filter */}
      <div className="relative w-[160px] shrink-0">
        <Select
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value)}
          options={[
            { value: '', label: 'ALL PRIORITY' },
            { value: 'LOW', label: 'LOW' },
            { value: 'MEDIUM', label: 'MEDIUM' },
            { value: 'HIGH', label: 'HIGH' },
            { value: 'CRITICAL', label: 'CRITICAL' },
          ]}
          className="text-xs"
        />
      </div>

      {/* Right: count + create */}
      <div className="ml-auto flex items-center gap-4">
        <span className="font-mono text-xs text-muted tracking-widest whitespace-nowrap">
          [{total} PROJECTS]
        </span>
        {isAdmin && (
          <Button
            onClick={onCreateClick}
            size="sm"
            className="whitespace-nowrap"
          >
            + NEW PROJECT
          </Button>
        )}
      </div>
    </div>
  )
}
