import { STATUSES } from '../lib/race-data'

interface StatusChipProps {
  value: string
}

export function StatusChip({ value }: StatusChipProps) {
  const s = STATUSES.find(x => x.value === value) || STATUSES[0]
  return (
    <span className={`chip status-${value}`}>
      <span>{s.icon}</span>
      <span>{s.short}</span>
    </span>
  )
}