type EventStatus = 'all' | 'scheduled' | 'running' | 'finished'

type StatusCounts = {
  all: number
  scheduled: number
  running: number
  finished: number
}

type EventStatusFilterProps = {
  active: EventStatus
  counts: StatusCounts
  onChange: (status: EventStatus) => void
}

const FILTERS: Array<{ key: EventStatus; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'scheduled', label: 'A venir' },
  { key: 'running', label: 'En cours' },
  { key: 'finished', label: 'Termines' },
]

export function EventStatusFilter({ active, counts, onChange }: EventStatusFilterProps) {
  return (
    <div className="tabs">
      {FILTERS.map(f => (
        <button
          key={f.key}
          className="tab"
          aria-selected={active === f.key}
          onClick={() => onChange(f.key)}
        >
          {f.label}
          <span className="tab-num">{counts[f.key]}</span>
        </button>
      ))}
    </div>
  )
}
