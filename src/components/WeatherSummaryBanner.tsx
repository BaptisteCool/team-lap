import { wmoToInfo, isNotableWeather } from '../lib/weather-codes'

export interface HourlyForecast {
  time: number[] // ms epoch
  temperature_2m: number[]
  relative_humidity_2m: number[]
  weather_code: number[]
  precipitation_probability: number[]
}

interface WeatherSummaryBannerProps {
  forecast: HourlyForecast | null | undefined
  // null/undefined → masque le bandeau ; { reason } → affiche message neutre
  unavailable?: { reason: string } | null
  // When provided, banner becomes clickable to open source picker dialog.
  onClick?: () => void
  // Provider label shown inline (e.g. "Met.no"). Optional.
  providerLabel?: string
  // City name shown as a leading chip ("Brette les Pins · Prochaines 6h …"). Optional.
  cityName?: string | null
}

// Banner "Prochaines 6h : X°C en moyenne, pluie vers HHh"
// Auto-hides if no forecast and no explicit "unavailable" reason.
export function WeatherSummaryBanner({
  forecast,
  unavailable,
  onClick,
  providerLabel,
  cityName,
}: WeatherSummaryBannerProps) {
  const interactive = !!onClick
  if (unavailable) {
    return (
      <div
        onClick={onClick}
        style={{
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--muted)',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          marginBottom: 8,
          cursor: interactive ? 'pointer' : 'default',
        }}
      >
        🌫 Météo indisponible{interactive ? ' · cliquez pour changer de source' : ''}
      </div>
    )
  }

  if (!forecast || !forecast.time || forecast.time.length === 0) return null

  const now = Date.now()
  // Pick indexes for the next 6h
  const idxs: number[] = []
  for (let i = 0; i < forecast.time.length && idxs.length < 6; i++) {
    if (forecast.time[i] >= now - 30 * 60 * 1000) idxs.push(i)
  }
  if (idxs.length === 0) return null

  const temps = idxs.map((i) => forecast.temperature_2m[i]).filter((t) => t != null) as number[]
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null

  // Notable event detection — first slot with rain/snow/storm
  let notable: { hour: string; info: ReturnType<typeof wmoToInfo> } | null = null
  for (const i of idxs) {
    const code = forecast.weather_code[i]
    if (isNotableWeather(code)) {
      const d = new Date(forecast.time[i])
      notable = { hour: d.toLocaleTimeString('fr-FR', { hour: '2-digit', timeZone: 'Europe/Paris' }), info: wmoToInfo(code) }
      break
    }
  }

  const summary = avg != null ? `${Math.round(avg)}°C en moyenne` : '—'
  const notableText = notable ? ` · ${notable.info.emoji} ${notable.info.label.toLowerCase()} vers ${notable.hour}` : ''

  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick?.()
        }
      }}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--text-2)',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (interactive) e.currentTarget.style.background = 'var(--bg)'
      }}
      onMouseLeave={(e) => {
        if (interactive) e.currentTarget.style.background = 'var(--bg-2)'
      }}
      title={interactive ? 'Cliquer pour changer de source météo' : undefined}
    >
      {cityName && (
        <span style={{ fontWeight: 600 }}>📍 {cityName}</span>
      )}
      <span style={{ fontWeight: 600 }}>Prochaines 6h :</span>
      <span>{summary}{notableText}</span>
      {providerLabel && (
        <span
          className="mono"
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}
        >
          via {providerLabel}{interactive ? ' ▾' : ''}
        </span>
      )}
    </div>
  )
}
