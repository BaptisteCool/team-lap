  import { ENERGY_LEVELS } from '../lib/race-data'

interface EnergySegmentProps {
  value: number
  onChange: (value: number) => void
  size?: 'sm' | 'md'
}

export function EnergySegment({ value, onChange, size = 'md' }: EnergySegmentProps) {
  return (
    <div className="seg" role="group" aria-label="Niveau d'énergie">
      {ENERGY_LEVELS.map(e => (
        <button
          key={e.value}
          type="button"
          aria-pressed={value === e.value}
          className={`seg-btn is-energy-${e.value}`}
          onClick={() => onChange(e.value)}
          title={e.label}
        >
          <span className="dot" />
          <span>{size === 'sm' ? e.short : e.label}</span>
        </button>
      ))}
    </div>
  )
}