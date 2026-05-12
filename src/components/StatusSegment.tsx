import { STATUSES } from '../lib/race-data'

interface StatusSegmentProps {
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export function StatusSegment({ value, onChange, size = 'md' }: StatusSegmentProps) {
  return (
    <div className="seg" role="group" aria-label="Statut">
      {STATUSES.map(s => (
        <button
          key={s.value}
          type="button"
          aria-pressed={value === s.value}
          className={`seg-btn is-status-${s.value}`}
          onClick={() => onChange(s.value)}
          title={s.label}
        >
          <span>{s.icon}</span>
          <span>{size === 'sm' ? s.short : s.label}</span>
        </button>
      ))}
    </div>
  )
}