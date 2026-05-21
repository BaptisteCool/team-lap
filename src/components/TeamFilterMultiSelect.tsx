import { Check, ChevronDown, Search, X } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { TeamFilterOption } from './TestModeTimelapseSlider'

export type TeamFilterMultiSelectProps = {
  options: TeamFilterOption[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
  maxSelected?: number
}

export function TeamFilterMultiSelect({
  options,
  selectedIds,
  onToggle,
  onClear,
  maxSelected = 3,
}: TeamFilterMultiSelectProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.trim().toLowerCase()
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [search, options])

  const selectedCount = selectedIds.size
  const summary = selectedCount === 0
    ? 'Toutes équipes'
    : `${selectedCount}/${maxSelected} équipes`

  return (
    <div className="team-multiselect" ref={rootRef}>
      <button
        type="button"
        className={`team-multiselect-trigger${selectedCount > 0 ? ' is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="team-multiselect-summary">{summary}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="team-multiselect-panel" role="listbox" aria-multiselectable>
          <div className="team-multiselect-search">
            <Search size={12} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une équipe…"
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="team-multiselect-search-clear"
                onClick={() => setSearch('')}
                aria-label="Effacer recherche"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="team-multiselect-list">
            {filtered.length === 0 && (
              <div className="team-multiselect-empty">Aucun résultat</div>
            )}
            {filtered.map((opt) => {
              const active = selectedIds.has(opt.id)
              const disabled = !active && selectedCount >= maxSelected
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`team-multiselect-option${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                  onClick={() => { if (!disabled) onToggle(opt.id) }}
                  disabled={disabled}
                  style={{ ['--chip-color' as any]: opt.color }}
                >
                  <span className="team-multiselect-checkbox">
                    {active && <Check size={12} />}
                  </span>
                  <span className="team-multiselect-dot" />
                  <span className="team-multiselect-name">{opt.name}</span>
                </button>
              )
            })}
          </div>

          {selectedCount > 0 && (
            <button
              type="button"
              className="team-multiselect-clear"
              onClick={() => { onClear(); setSearch('') }}
            >
              Tout afficher
            </button>
          )}
        </div>
      )}
    </div>
  )
}
