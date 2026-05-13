
interface EnergyBarProps {
  value: number
}

export function EnergyBar({ value }: EnergyBarProps) {
  return (
    <span className={`energy-bar lvl-${value}`} title={`Énergie ${value}%`}>
      <span className="pip" />
      <span className="pip" />
      <span className="pip" />
      <span className="pip" />
    </span>
  )
}