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

// ── Custom checkbox ────────────────────────────────────────────────────────────

function Checkbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all duration-100 ${
        checked || indeterminate
          ? 'bg-blue-600 border-blue-600'
          : 'bg-surface-raised border-border-default'
      }`}
    >
      {indeterminate && !checked ? (
        // dash for indeterminate
        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 2" fill="currentColor">
          <rect width="10" height="2" rx="1" />
        </svg>
      ) : checked ? (
        // checkmark
        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4l3 3 5-6" />
        </svg>
      ) : null}
    </span>
  )
}

// ── MultiSelect ────────────────────────────────────────────────────────────────

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select…',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref    = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else setSearch('')
  }, [open])

  const allSelected  = selected.length === options.length && options.length > 0
  const someSelected = selected.length > 0 && !allSelected

  const filtered = options.filter((o) =>
    !search || o.label.toLowerCase().includes(search.toLowerCase()) || (o.sub ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function toggleAll() {
    onChange(allSelected ? [] : options.map((o) => o.id))
  }

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === options.length
        ? 'All selected'
        : selected.length === 1
          ? (options.find((o) => o.id === selected[0])?.label ?? '1 selected')
          : `${selected.length} selected`

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 bg-surface-raised border rounded-xl text-sm text-left transition-all duration-150 ${
          open
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm'
            : 'border-border-default hover:border-border-strong'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selected.length > 0 && (
            <span className="shrink-0 text-[11px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md">
              {selected.length}
            </span>
          )}
          <span className={`truncate ${selected.length === 0 ? 'text-text-muted' : 'text-text-primary font-medium'}`}>
            {triggerLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange([]) }}
              className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-secondary rounded transition-colors"
              title="Clear all"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </span>
          )}
          <svg
            className={`w-4 h-4 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-surface-raised border border-border-default rounded-xl shadow-xl overflow-hidden">
          {/* Search */}
          {options.length > 5 && (
            <div className="px-3 pt-2.5 pb-2 border-b border-border-subtle">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-7 pr-3 py-1.5 text-sm bg-surface-highlight border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Select All */}
          {filtered.length > 0 && !search && (
            <button
              type="button"
              onClick={toggleAll}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-highlight border-b border-border-subtle transition-colors text-left"
            >
              <Checkbox checked={allSelected} indeterminate={someSelected} />
              <span className="text-sm font-semibold text-text-secondary">Select All</span>
              {selected.length > 0 && (
                <span className="ml-auto text-xs text-text-muted">{selected.length}/{options.length}</span>
              )}
            </button>
          )}

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((opt) => {
              const isChecked = selected.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-highlight transition-colors text-left ${
                    isChecked ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <Checkbox checked={isChecked} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${isChecked ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                      {opt.label}
                    </p>
                    {opt.sub && (
                      <p className="text-[11px] text-text-muted truncate mt-0.5">{opt.sub}</p>
                    )}
                  </div>
                  {isChecked && (
                    <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}

            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-text-muted">
                  {search ? `No results for "${search}"` : 'No options available'}
                </p>
              </div>
            )}
          </div>

          {/* Footer — show selected count & clear */}
          {selected.length > 0 && (
            <div className="px-3.5 py-2.5 border-t border-border-subtle flex items-center justify-between bg-surface-highlight">
              <span className="text-xs text-text-muted font-medium">{selected.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
