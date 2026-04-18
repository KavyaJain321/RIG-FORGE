'use client'

import { useState, useRef, useEffect } from 'react'

export interface MultiSelectOption {
  id: string
  label: string
  sub?: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select…' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allSelected = selected.length === options.length
  const someSelected = selected.length > 0 && !allSelected

  function toggleAll() {
    onChange(allSelected ? [] : options.map((o) => o.id))
  }

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === options.length
        ? 'All selected'
        : selected.length === 1
          ? (options.find((o) => o.id === selected[0])?.label ?? '1 selected')
          : `${selected.length} selected`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-left hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <span className={selected.length === 0 ? 'text-gray-400' : 'text-gray-800 font-medium'}>
          {label}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {/* Select All */}
          <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected }}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm font-semibold text-gray-700">Select All</span>
          </label>

          {/* Options */}
          {options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => toggle(opt.id)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{opt.label}</p>
                {opt.sub && <p className="text-xs text-gray-400 truncate">{opt.sub}</p>}
              </div>
            </label>
          ))}

          {options.length === 0 && (
            <p className="px-3 py-4 text-sm text-gray-400 text-center">No options available</p>
          )}
        </div>
      )}
    </div>
  )
}
