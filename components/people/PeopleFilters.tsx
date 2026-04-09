'use client'

import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

interface PeopleFiltersProps {
  search: string
  role: string
  status: string
  onSearchChange: (value: string) => void
  onRoleChange: (value: string) => void
  onStatusChange: (value: string) => void
}

export default function PeopleFilters({
  search,
  role,
  status,
  onSearchChange,
  onRoleChange,
  onStatusChange,
}: PeopleFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted text-sm select-none pointer-events-none">
          ⌕
        </span>
        <Input
          type="text"
          aria-label="Search members"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="SEARCH MEMBERS..."
          className="pl-8 pr-4 py-2 text-xs"
        />
      </div>

      {/* Role filter */}
      <div className="relative min-w-[140px]">
        <Select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          options={[
            { value: '', label: 'ALL ROLES' },
            { value: 'ADMIN', label: 'ADMIN' },
            { value: 'MEMBER', label: 'MEMBER' },
          ]}
          className="text-xs"
        />
      </div>

      {/* Status filter */}
      <div className="relative min-w-[160px]">
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          options={[
            { value: '', label: 'ALL STATUS' },
            { value: 'ACTIVE', label: 'ACTIVE' },
            { value: 'FOCUS', label: 'FOCUS' },
            { value: 'AVAILABLE', label: 'AVAILABLE' },
            { value: 'IN_MEETING', label: 'IN MEETING' },
            { value: 'OFFLINE', label: 'OFFLINE' },
          ]}
          className="text-xs"
        />
      </div>
    </div>
  )
}
