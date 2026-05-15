import { wmoToInfo } from '../lib/weather-codes'

interface WeatherBadgeProps {
  weatherCode: number | null | undefined
  temperature: number | null | undefined
  // Optional context shown on hover (humidity %, precipitation %, full label)
  humidity?: number | null
  precipitation?: number | null
}

// Compact badge: emoji + temp. Used inline next to ETA in Planning.
// Returns null when both weatherCode and temperature are missing.
export function WeatherBadge({ weatherCode, temperature, humidity, precipitation }: WeatherBadgeProps) {
  if (weatherCode == null && temperature == null) return null
  const info = wmoToInfo(weatherCode)
  const tempStr = temperature != null ? `${Math.round(temperature)}°C` : '—'
  const tooltipParts = [info.label, `${tempStr}`]
  if (humidity != null) tooltipParts.push(`${Math.round(humidity)}% hum.`)
  if (precipitation != null && precipitation > 0) tooltipParts.push(`${Math.round(precipitation)}% pluie`)
  return (
    <span
      className="mono"
      title={tooltipParts.join(' · ')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 6,
        fontSize: 11,
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        color: 'var(--text-2)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{info.emoji}</span>
      <span>{tempStr}</span>
    </span>
  )
}
